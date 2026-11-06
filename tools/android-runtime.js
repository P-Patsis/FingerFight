// Loaded only in the packaged Android shell.
const App = window.Capacitor.registerPlugin('App');
App.addListener('appStateChange', ({ isActive }) => {
  if (!isActive) window.dispatchEvent(new Event('pagehide'));
  else window.dispatchEvent(new Event('online'));
});
App.addListener('backButton', () => {
  if (history.state?.ff) history.back();
  else App.exitApp();
});
