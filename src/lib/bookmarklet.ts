export function normalizeBookmarkletOrigin(value: string) {
  try {
    return new URL(value.trim()).origin;
  } catch {
    return "";
  }
}

export function buildCaptureBookmarklet(appOrigin: string) {
  const origin = normalizeBookmarkletOrigin(appOrigin);
  if (!origin) return "";

  const target = `${origin}/share-target`;
  const script = [
    "(function(){",
    'var note="";',
    "try{note=window.getSelection?String(window.getSelection()).slice(0,800):\"\";}catch(error){}",
    `var target=${JSON.stringify(target)};`,
    'var query="?title="+encodeURIComponent(document.title||location.href)+"&url="+encodeURIComponent(location.href)+"&text="+encodeURIComponent(note);',
    'window.open(target+query,"_blank","noopener,noreferrer");',
    "})();"
  ].join("");

  return `javascript:${script}`;
}
