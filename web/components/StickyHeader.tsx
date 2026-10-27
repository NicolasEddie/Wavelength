/**
 * Keeps the site header pinned to the top of the window. No solid bar: a soft dark fade behind it
 * keeps the links readable over scrolling text while the starfield still shows through.
 *
 * `overlay`: the header floats over the content below instead of taking up space (the home hero).
 */
export default function StickyHeader({ overlay = false, children }: { overlay?: boolean; children: React.ReactNode }) {
  return (
    <div className={`sticky top-0 z-30 ${overlay ? "h-0" : ""}`}>
      <header className="site-header">{children}</header>
    </div>
  );
}
