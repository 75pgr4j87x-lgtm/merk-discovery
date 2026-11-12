import type {Firestore} from 'firebase-admin/firestore';
// Transactional in-memory fixture for exercising the actual operations store.
// It models rollback/atomic create; live Firestore/index checks remain separate.
export class MemoryDB {
  rows=new Map<string,Record<string,any>>();retryOnce=false;
  collection(path:string){return new Query(this,path);}
  async getAll(...refs:Ref[]){return Promise.all(refs.map(r=>r.get()));}
  async runTransaction<T>(fn:(tx:any)=>Promise<T>):Promise<T>{
    for(let attempt=0;attempt<2;attempt++){
      const writes:Array<()=>void>=[];
      const tx={get:async(ref:Ref|Query)=>{if(writes.length)throw new Error('Firestore transactions require all reads before writes');return ref.get();},set:(r:Ref,v:any)=>writes.push(()=>this.rows.set(r.path,structuredClone(v))),create:(r:Ref,v:any)=>writes.push(()=>{if(this.rows.has(r.path))throw new Error('Already exists');this.rows.set(r.path,structuredClone(v));}),update:(r:Ref,v:any)=>writes.push(()=>{if(!this.rows.has(r.path))throw new Error('Missing document');this.rows.set(r.path,{...this.rows.get(r.path),...structuredClone(v)});})};
      const result=await fn(tx);if(this.retryOnce&&attempt===0){this.retryOnce=false;continue;}
      const backup=new Map(this.rows);try{writes.forEach(w=>w());return result;}catch(e){this.rows=backup;throw e;}
    }throw new Error('Retries exhausted');
  }
  firestore(){return this as unknown as Firestore;}
}
class Ref {
  constructor(public db:MemoryDB,public path:string){}get id(){return this.path.split('/').at(-1)!;}
  collection(name:string){return new Query(this.db,this.path+'/'+name);}
  async get(){const value=this.db.rows.get(this.path);return {id:this.id,exists:Boolean(value),ref:this,data:()=>value?structuredClone(value):undefined,get:(key:string)=>value?.[key]};}
}
class Query {
  filters:Array<[string,string,any]>=[];orders:Array<[string,string]>=[];maximum=Infinity;after:any[]=[];
  constructor(public db:MemoryDB,public path:string){}
  doc(id=crypto.randomUUID()){return new Ref(this.db,this.path+'/'+id);}
  clone(){const q=new Query(this.db,this.path);q.filters=[...this.filters];q.orders=[...this.orders];q.maximum=this.maximum;q.after=this.after;return q;}
  where(key:string,op:string,value:any){const q=this.clone();q.filters.push([key,op,value]);return q;}
  orderBy(key:string,dir='asc'){const q=this.clone();q.orders.push([key,dir]);return q;}
  limit(n:number){const q=this.clone();q.maximum=n;return q;}
  startAfter(...v:any[]){const q=this.clone();q.after=v;return q;}
  async get(){
    let rows=[...this.db.rows.entries()].filter(([p])=>p.startsWith(this.path+'/')&&p.split('/').length===this.path.split('/').length+1);
    rows=rows.filter(([,r])=>this.filters.every(([k,op,v])=>op==='=='?r[k]===v:op==='in'?v.includes(r[k]):op==='>='?typeof r[k]===typeof v&&r[k]>=v:op==='<='?typeof r[k]===typeof v&&r[k]<=v:false));
    const field=([p,r]:typeof rows[number],k:string)=>k==='__name__'?p.split('/').at(-1):r[k];
    const compare=(x:any,y:any)=>x<y?-1:x>y?1:0;
    rows.sort((a,b)=>{for(const [k,d] of this.orders){const c=compare(field(a,k),field(b,k))*(d==='desc'?-1:1);if(c)return c;}return 0;});
    if(this.after.length)rows=rows.filter(row=>{for(let i=0;i<this.orders.length;i++){const [k,d]=this.orders[i];const c=compare(field(row,k),this.after[i])*(d==='desc'?-1:1);if(c)return c>0;}return false;});
    const docs=await Promise.all(rows.slice(0,this.maximum).map(([p])=>new Ref(this.db,p).get()));return {docs,size:docs.length,empty:docs.length===0};
  }
}
