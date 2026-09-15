import { useRef } from 'react';
import type { EventCategory } from '../api/types';
import { categoryColors, categoryLabels } from '../theme';

export function CategoryChips({ shown, hidden, toggle, top }: { shown: boolean; hidden: ReadonlySet<EventCategory>; toggle: (category: EventCategory) => void; top: number }) {
  const drag=useRef({x:0,scroll:0,active:false,moved:false});
  return <div style={{position:'absolute',left:0,right:0,top,opacity:shown?1:0,transform:`translateY(${shown?0:-8}px)`,transition:'opacity 200ms, transform 200ms',pointerEvents:shown?'auto':'none'}}>
    <div data-testid="category-scroll" style={{display:'flex',gap:6,overflowX:'auto',scrollbarWidth:'none',padding:'4px 16px',cursor:'grab',userSelect:'none',touchAction:'pan-x'}}
      onPointerDown={event=>{if(event.pointerType==='mouse' && event.button===0)drag.current={x:event.clientX,scroll:event.currentTarget.scrollLeft,active:true,moved:false};}}
      onPointerMove={event=>{const state=drag.current;if(!state.active)return;const dx=event.clientX-state.x;if(Math.abs(dx)>6){state.moved=true;event.currentTarget.setPointerCapture(event.pointerId);}if(state.moved){event.preventDefault();event.currentTarget.scrollLeft=state.scroll-dx;}}}
      onPointerUp={event=>{drag.current.active=false;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
      onPointerCancel={()=>{drag.current.active=false;}}
      onClickCapture={event=>{if(drag.current.moved){event.preventDefault();event.stopPropagation();drag.current.moved=false;}}}>
      {(Object.keys(categoryLabels) as EventCategory[]).map(category=><button key={category} type="button" role="checkbox" aria-label={`筛选${categoryLabels[category]}`} aria-checked={!hidden.has(category)} tabIndex={shown?0:-1} onClick={()=>toggle(category)}
        style={{flexShrink:0,background:hidden.has(category)?'#FFFFFF':categoryColors[category],color:hidden.has(category)?categoryColors[category]:'#FFFFFF',border:`1px solid ${categoryColors[category]}`,borderRadius:10,padding:'7px 12px',fontSize:12,lineHeight:'16px',fontWeight:700,cursor:'inherit',fontFamily:'inherit'}}>{categoryLabels[category]}</button>)}
    </div>
  </div>;
}
