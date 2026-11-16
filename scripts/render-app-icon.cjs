const fs=require('node:fs'),path=require('node:path'),{chromium}=require('@playwright/test');
const {generateImageAsync}=require('@expo/image-utils');
const {setIconAsync}=require('../node_modules/@expo/prebuild-config/build/plugins/icons/withAndroidIcons.js');
(async()=>{
 const root=path.resolve(__dirname,'..'),browser=await chromium.launch({channel:'msedge',headless:true});
 try{const page=await browser.newPage({viewport:{width:1024,height:1024},deviceScaleFactor:1});await page.setContent('<style>html,body{margin:0;width:1024px;height:1024px;overflow:hidden}</style>'+fs.readFileSync(path.join(root,'assets/icon.svg'),'utf8'));await page.evaluate(()=>document.fonts.ready);await page.locator('svg').screenshot({path:path.join(root,'assets/icon.png')});}finally{await browser.close();}
 const favicon=await generateImageAsync({projectRoot:root,cacheType:'app-brand-favicon'},{src:path.join(root,'assets/icon.png'),width:48,height:48,resizeMode:'contain'});fs.writeFileSync(path.join(root,'assets/favicon.png'),favicon.source);
 await setIconAsync(root,{icon:'./assets/icon.png',foregroundImage:null,backgroundImage:null,backgroundColor:'#2F5D48',monochromeImage:null,isAdaptive:false});
 console.log('SVG icon rendered; favicon and Android icon resources updated.');
})().catch(e=>{console.error(e);process.exitCode=1;});
