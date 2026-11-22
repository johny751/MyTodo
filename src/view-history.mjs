// Keep view layers in browser history. Task data stays in the normal storage path.
export class ViewHistory {
 constructor({host,read,key,url,beforeApply,apply}){Object.assign(this,{host,read,key,url,beforeApply,apply});this.entries=[];this.index=0;this.busy=false;this.session=String(Date.now())+'-'+Math.random();this.onPop=e=>this.restore(e.state);host.addEventListener('popstate',this.onPop);}
 marker(index){return {gxView:this.session,index};}
 start(){this.entries=[this.read()];this.index=0;this.host.history.replaceState(this.marker(0),'',this.url(this.entries[0]));}
 record(){
  if(this.busy||!this.entries.length)return;
  const next=this.read(),current=this.entries[this.index],key=this.key(next);
  if(key===this.key(current)){this.entries[this.index]=next;return;}
  // Closing a layer consumes its entry, so Back never reopens a closed detail.
  let previous=-1;for(let i=this.index-1;i>=0;i--)if(this.key(this.entries[i])===key){previous=i;break;}
  if(previous>=0){this.busy=true;this.host.history.go(previous-this.index);return;}
  // A menu selection replaces the open menu rather than leaving it behind.
  if(current.navOpen&&!next.navOpen){this.entries[this.index]=next;this.host.history.replaceState(this.marker(this.index),'',this.url(next));return;}
  this.entries=this.entries.slice(0,this.index+1);this.entries.push(next);this.index++;this.host.history.pushState(this.marker(this.index),'',this.url(next));
 }
 back(){if(this.busy)return true;if(this.index===0)return false;this.busy=true;this.host.history.back();return true;}
 async restore(state){
  if(state?.gxView!==this.session||!this.entries[state.index]){this.busy=false;return;}
  if(this.reverting){this.reverting=false;this.busy=false;return;}
  const index=state.index,target=this.entries[index];this.busy=true;
  try{
   if(await this.beforeApply(target)===false){this.reverting=true;this.host.history.go(this.index-index);return;}
   this.index=index;await this.apply(target);this.entries[index]=this.read();
  }finally{if(!this.reverting)this.busy=false;}
 }
}
