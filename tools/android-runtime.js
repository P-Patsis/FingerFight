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

const accountUrl=url=>{if(typeof url==='string')window.dispatchEvent(new CustomEvent('ff-app-url',{detail:{url}}));};
App.addListener('appUrlOpen',({url})=>accountUrl(url));
if(App.getLaunchUrl)App.getLaunchUrl().then(result=>accountUrl(result?.url)).catch(()=>{});
