"use client";

import { useEffect, useState } from "react";
import { HUB_URL, navLinks, products } from "@/lib/site";
import { Wordmark } from "./Logo";

export function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);

  return (
    <header className={`nav ${scrolled ? "is-scrolled" : ""} ${open ? "is-open" : ""}`}>
      <div className="wrap nav-inner">
        <a href="/" aria-label="Omni Force Vector home"><Wordmark /></a>
        <nav aria-label="Main" className="nav-links">
          <div className="nav-drop">
            <a href="/#products">Products</a>
            <div className="nav-menu">
              {products.map((p) => <a key={p.key} href={`/products/${p.key}`}>{p.name}</a>)}
            </div>
          </div>
          {navLinks.filter((l) => l.href !== "/#products").map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
        </nav>
        <div className="nav-cta">
          <a className="btn btn-text" href={`${HUB_URL}/login`}>Sign in</a>
          <a className="btn btn-primary" href={`${HUB_URL}/signup`}>Create account</a>
        </div>
        <button type="button" className="menu-btn" aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((o) => !o)}>
          <svg className="icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d={open ? "M6 6l12 12M18 6 6 18" : "M4 7h16M4 12h16M4 17h16"} /></svg>
        </button>
      </div>
      <div id="mobile-menu" className="mobile-menu" hidden={!open}>
        <nav aria-label="Mobile" className="wrap">
          {products.map((p) => <a key={p.key} href={`/products/${p.key}`} onClick={() => setOpen(false)}>{p.name}</a>)}
          {navLinks.filter((l) => l.href !== "/#products").map((l) => <a key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>)}
          <div className="mobile-cta">
            <a className="btn btn-ghost" href={`${HUB_URL}/login`}>Sign in</a>
            <a className="btn btn-primary" href={`${HUB_URL}/signup`}>Create account</a>
          </div>
        </nav>
      </div>
    </header>
  );
}
