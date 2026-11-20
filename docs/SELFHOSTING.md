# Self-hosting the web app

WizardChat's web app is a static site: you only need a web server, and you can host it next to your homeserver so your
users sign in to your server by default.

## Docker

Every release publishes an image to the [GitLab container registry][registry], tagged with the version
(`26.12.4`, or `26.12.4-next.1` for next releases). It serves the app with nginx on port 80:

```sh
docker run -d --name wizardchat -p 8080:80 registry.gitlab.com/wizardchat/wizardchat:<version>
```

Then open <http://localhost:8080>. `/health` answers `OK` for health checks.

With Docker Compose:

```yaml
services:
  wizardchat:
    image: registry.gitlab.com/wizardchat/wizardchat:<version>
    restart: unless-stopped
    ports:
      - '8080:80'
    volumes:
      - ./config.json:/usr/share/nginx/html/config.json:ro
```

You can also build the image yourself from a checkout with `docker build -t wizardchat .`.

### HTTPS

Put the container behind your reverse proxy (Caddy, Traefik, nginx...) and serve it over HTTPS. Browsers only allow
notifications, the microphone and the camera on HTTPS pages, and OAuth sign-in needs a public `https://` address.

## Without Docker

Build it (see [Building](BUILDING.md)) and serve `apps/web/dist/` with any web server. Send every path that isn't a
file to `index.html`, since the app handles its own routes. [`apps/web/nginx.conf`](../apps/web/nginx.conf) is a
working nginx setup, including the caching and security headers.

## Configuration

The app reads `config.json` from its own address (`https://chat.example.org/config.json`) when it starts, so you can
change it without rebuilding. The image ships an empty one (`{}`), which keeps every default. To configure it, mount
your own file over `/usr/share/nginx/html/config.json` as in the Compose example above, or replace `config.json` in
your `dist` folder. Users get the new settings the next time they open or reload the app.

```json
{
  "homeserverList": ["example.org"],
  "defaultHomeserver": 0,
  "allowCustomHomeservers": false,
  "gifApiUrl": "https://gifs.example.org"
}
```

| Key                      | Default                                           | What it does                                                                                                                                        |
| ------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `homeserverList`         | `["matrix.org", "mozilla.org", "unredacted.org"]` | The servers offered on the sign-in, sign-up and password reset screens. A server name (`example.org`) or an address (`https://matrix.example.org`). |
| `defaultHomeserver`      | `0`                                               | Which server in the list is picked at first, counting from 0. `null` picks none, so the user types their server.                                    |
| `allowCustomHomeservers` | `true`                                            | Whether users can type a server that isn't in the list. Always on when the list is empty.                                                           |
| `gifApiUrl`              | `https://gifs.wizardchat.org`                     | The GIF search service used by the GIF picker.                                                                                                      |

Keys you leave out, and values that aren't valid, keep their default. If `config.json` can't be read at all, the app
starts with the defaults and logs a warning in the browser console.

A server name is looked up through its `/.well-known/matrix/client`, like in any Matrix client, so `example.org` works
when your homeserver runs at `matrix.example.org`.

A link like `https://chat.example.org/welcome/example.org` opens the sign-in screen with that server picked. If it isn't
in the list and `allowCustomHomeservers` is `false`, the default server is picked instead.

### Examples

Only your own server, nothing else to pick:

```json
{ "homeserverList": ["example.org"], "allowCustomHomeservers": false }
```

Your server first, and any other one allowed:

```json
{ "homeserverList": ["example.org", "matrix.org"] }
```

No server picked, users type their own:

```json
{ "homeserverList": [], "defaultHomeserver": null }
```

[registry]: https://gitlab.com/wizardchat/wizardchat/container_registry/
