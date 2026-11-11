//! End-to-end check of account management: registration, availability, password change,
//! profile fields (banner) and deactivation, on a fresh throwaway account.
//!
//!     WZ_SERVER=http://localhost:8008 cargo run -p wizardchat-core --example account

#![recursion_limit = "256"]

use serde_json::json;
use wizardchat_core::{StoreConfig, UiaAuth, UiaOutcome, WizardClient};

type BoxError = Box<dyn std::error::Error>;

fn store(name: &str) -> StoreConfig {
    let dir =
        std::env::temp_dir().join(format!("wizardchat-account-{}-{name}", std::process::id()));
    StoreConfig {
        location: dir.to_string_lossy().into_owned(),
        passphrase: Some("account-test".into()),
        exclude_insecure_devices: false,
        manual_encryption_setup: false,
        process_name: None,
    }
}

#[tokio::main]
async fn main() -> Result<(), BoxError> {
    let server = std::env::var("WZ_SERVER")?;
    let name = format!("wzreg{}", std::process::id());
    let info = WizardClient::registration_info(&server).await?;
    println!(
        "registration enabled: {}, flows {:?}",
        info.enabled, info.flows
    );
    assert!(WizardClient::username_available(&server, &name).await?);
    // A throwaway password for a throwaway account; never printed
    let password = format!("pw-{}-{}", std::process::id(), name.len() * 7919);
    let (client, session) =
        WizardClient::register(&server, &name, &password, "account test", None, store("a")).await?;
    assert!(!WizardClient::username_available(&server, &name).await?);
    println!("registered {} and the name is taken now", session.user_id);

    let types = client.account_data_types().await?;
    println!("account data types: {types:?}");
    println!(
        "  well-known homeserver: {:?}",
        client.well_known_homeserver_url().await
    );

    let probe = format!("{password}-probe");
    let UiaOutcome::AuthRequired {
        flows,
        session: uia_session,
        ..
    } = client.change_password_with_auth(&probe, None).await?
    else {
        panic!("the server changed the password without confirmation");
    };
    assert!(flows.iter().flatten().any(|s| s == "m.login.password"));
    assert!(matches!(
        client
            .change_password_with_auth(
                &probe,
                Some(UiaAuth::Password {
                    password: "wrong".into(),
                    session: uia_session.clone(),
                }),
            )
            .await,
        Err(wizardchat_core::Error::InvalidCredentials)
    ));
    let UiaOutcome::AuthRequired {
        session: uia_session,
        ..
    } = client.change_password_with_auth(&probe, None).await?
    else {
        panic!("expected a new auth session");
    };
    assert!(matches!(
        client
            .change_password_with_auth(
                &probe,
                Some(UiaAuth::Password {
                    password: password.clone(),
                    session: uia_session,
                }),
            )
            .await?,
        UiaOutcome::Done
    ));
    let password = probe;
    println!("password change asks for auth first (flows {flows:?}), refuses a wrong password");

    let (extra, extra_session) =
        WizardClient::login_password(&server, &name, &password, "account test x", store("x"))
            .await?;
    let device = vec![extra_session.device_id.clone()];
    let UiaOutcome::AuthRequired {
        session: uia_session,
        ..
    } = client.delete_devices_with_auth(&device, None).await?
    else {
        panic!("the server removed a device without confirmation");
    };
    assert!(matches!(
        client
            .delete_devices_with_auth(
                &device,
                Some(UiaAuth::Password {
                    password: password.clone(),
                    session: uia_session,
                }),
            )
            .await?,
        UiaOutcome::Done
    ));
    drop(extra);
    println!("device removed after confirming with the password");

    let new_password = format!("{password}-new");
    assert!(client
        .change_password("wrong password", &new_password)
        .await
        .is_err());
    client.change_password(&password, &new_password).await?;
    let (again, _) =
        WizardClient::login_password(&server, &name, &new_password, "account test 2", store("b"))
            .await?;
    println!("wrong current password refused; changed it and signed in with the new one");

    client
        .set_profile_field("org.wizardchat.test", json!({ "a": 1 }))
        .await?;
    let me = session.user_id.clone();
    assert_eq!(
        again.profile_field(&me, "org.wizardchat.test").await?,
        Some(json!({ "a": 1 }))
    );
    client.delete_profile_field("org.wizardchat.test").await?;
    client
        .set_banner(Some((vec![0x89, 0x50, 0x4e, 0x47], "image/png".into())))
        .await?;
    assert!(again
        .banner(&me)
        .await?
        .is_some_and(|b| b.starts_with("mxc://")));
    client.set_banner(None).await?;
    assert!(again.banner(&me).await?.is_none());
    println!("profile fields and banner set, read by another device, removed");
    println!(
        "  emails on account: {}",
        client.email_addresses().await?.len()
    );

    again.logout().await.ok();
    assert!(matches!(
        client.deactivate_account(None, false).await,
        Err(wizardchat_core::Error::PasswordRequired)
    ));
    client.deactivate_account(Some(&new_password), true).await?;
    assert!(
        WizardClient::login_password(&server, &name, &new_password, "x", store("c"))
            .await
            .is_err()
    );
    println!("deactivation asks for the password, then the account is gone");
    std::process::exit(0);
}
