// Keep the browser's one-use install event until a real user gesture.
let installPrompt = null;
let installed = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;

function status(message) {
  const el = document.querySelector('[data-install-status]');
  if (el) el.textContent = message;
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
});

window.addEventListener('appinstalled', () => {
  installed = true;
  installPrompt = null;
  status('Installed. Open REZ: HYRULE from your home screen.');
});

document.addEventListener('click', async (event) => {
  if (!event.target.closest('[data-install]')) return;
  if (installed) {
    status('The app is already installed.');
    return;
  }
  if (!installPrompt) {
    status('Android: open this site in Chrome, then use its menu → Add to Home screen → Install. Load the game online once before playing offline.');
    return;
  }
  if (!event.isTrusted) {
    status('Tap Install app on the screen to open the Android install prompt.');
    return;
  }
  const prompt = installPrompt;
  installPrompt = null;
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    status(choice.outcome === 'accepted'
      ? 'Installation requested. Look for REZ: HYRULE on your home screen.'
      : 'Installation dismissed. You can still install from Chrome’s menu.');
  } catch {
    status('Use Chrome’s menu → Add to Home screen → Install to install the game.');
  }
});
