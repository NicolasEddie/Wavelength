/**
 * Keeps the site header pinned to the top of the window. It stays transparent throughout, so the
 * starfield shows through behind it.
 *
 * `overlay`: the header floats over the content below instead of taking up space (the home hero).
 */
export default function StickyHeader({ overlay = false, children }: { overlay?: boolean; children: React.ReactNode }) {
  return (
    <div className={`sticky top-0 z-30 ${overlay ? "h-0" : ""}`}>
      <header>{children}</header>
    </div>
  );
}
