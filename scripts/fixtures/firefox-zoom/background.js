// Test-only extension, isolated browser/profile, no content scripts or network access.
browser.tabs.onUpdated.addListener(async (id,change,tab)=>{
 if(change.status==='complete'&&tab.url?.startsWith('http://127.0.0.1:5185/')){
  await browser.tabs.setZoomSettings(id,{mode:'automatic',scope:'per-tab'});
  await browser.tabs.setZoom(id,2);
 }
});
