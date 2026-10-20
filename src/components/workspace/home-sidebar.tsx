'use client';
import { useState, type ReactNode } from 'react';
export function HomeSidebar({tree}:{tree:ReactNode}) {
  const [expanded,setExpanded]=useState(false);
  return <aside className={`sm-home-sidebar ${expanded?'is-open':''}`}>
    <button type="button" className="sm-home-sidebar-toggle" onClick={()=>setExpanded(!expanded)} aria-label={expanded?'Collapse topology':'Expand topology'} aria-expanded={expanded}>☰</button>
    {expanded && tree}
  </aside>;
}
