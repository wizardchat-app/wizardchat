const LOGO = [
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⡴⠁⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⢀⣴⣿⣟⠁⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⢠⣿⣿⣿⣿⡀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⣰⣿⣿⣿⣿⣿⣧⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⢀⣼⣿⣿⣿⣿⣿⣿⣿⡄⠀⠀⠀⠀',
  '⠀⣀⣤⣶⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣶⣤⣀⠀',
  '⠉⠙⠻⠿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠿⠟⠋⠉',
];
const LOGO_COLORS = ['#EADCFF', '#DAC7FB', '#C9B2F7', '#B99DF3', '#A988EF', '#9873EB', '#885EE7'];

export function printConsoleWelcome(): void {
  const styles: string[] = [];
  let format = '';
  LOGO.forEach((row, i) => {
    format += `%c${row}\n`;
    styles.push(`font-family:monospace;line-height:1.2;color:${LOGO_COLORS[i]}`);
  });
  format +=
    '\n%cWelcome to WizardChat!' +
    '\n\n%cCurious how WizardChat works, or want to make it better? It’s open source, and everyone can contribute.' +
    '\n\n🤝 Contribute to WizardChat: https://gitlab.com/wizardchat/wizardchat/-/blob/main/CONTRIBUTING.md' +
    '\n🐞 Report a bug or suggest a feature: https://gitlab.com/wizardchat/wizardchat/-/issues/new' +
    '\n💬 Talk to us on Matrix: https://matrix.to/#/#wizardchat-app:matrix.org' +
    '\n\n%c⚠️ Don’t paste anything here that someone sent you. It could give them access to your account and messages.';
  styles.push(
    'font-family:monospace;font-size:24px;font-weight:bold;line-height:2',
    'font-family:monospace;font-size:12px;line-height:1.8',
    'font-family:monospace;font-size:12px;font-weight:bold;line-height:1.8;color:#ff6b6b'
  );
  // eslint-disable-next-line no-console
  console.log(format, ...styles);
}
