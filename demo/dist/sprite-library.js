// Browser-local sprite storage. Presets keep small stable IDs, never temporary blob URLs.
export class SpriteLibrary{
  constructor(){this.records=new Map();this.db=null;}
  async init(){
    this.db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('percepta-assets',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('sprites',{keyPath:'id'});
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    const all=await this.request('readonly',store=>store.getAll());
    for(const record of all)this.records.set(record.id,record);
    return this;
  }
  request(mode,action){return new Promise((resolve,reject)=>{
    const tx=this.db.transaction('sprites',mode),request=action(tx.objectStore('sprites'));let result;
    request.onsuccess=()=>result=request.result;tx.oncomplete=()=>resolve(result);
    tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}
  async add(file){
    if(!/image\/(png|jpeg|webp)/.test(file.type)||file.size>16*1024*1024)throw new Error('Use a PNG, JPG or WebP image up to 16 MB.');
    const url=URL.createObjectURL(file),image=new Image();
    try{image.src=url;await image.decode();if(image.width>4096||image.height>4096)throw new Error('Sprite images must be 4096 × 4096 px or smaller.');}
    finally{URL.revokeObjectURL(url);}
    const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
    const id='sprite-'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
    if(this.records.has(id))return this.records.get(id);
    const record={id,name:file.name||'Sprite',blob:file};
    if(this.db)await this.request('readwrite',store=>store.put(record));
    this.records.set(id,record);return record;
  }
  options(){return [{value:'',label:'No sprite'},...Array.from(this.records.values(),r=>({value:r.id,label:r.name}))];}
  async export(ids){
    return Promise.all([...new Set(ids.filter(Boolean))].map(async id=>{
      const record=this.records.get(id);if(!record)throw new Error('A sprite used by this preset is missing.');
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(record.blob);});
      return {id,name:record.name,data};
    }));
  }
}
