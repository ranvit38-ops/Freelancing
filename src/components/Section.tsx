/** Consistent vertical-rhythm section wrapper with an optional heading block. */
export function Section({
  id,
  eyebrow,
  heading,
  subheading,
  children,
  className = "",
}: {
  id?: string;
  eyebrow?: string;
  heading?: string;
  subheading?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`py-16 sm:py-20 ${className}`}>
      <div className="container-page">
        {(eyebrow || heading || subheading) && (
          <div className="mx-auto mb-12 max-w-2xl text-center">
            {eyebrow && (
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand">
                {eyebrow}
              </p>
            )}
            {heading && <h2 className="text-3xl font-bold sm:text-4xl">{heading}</h2>}
            {subheading && <p className="mt-4 text-lg text-muted">{subheading}</p>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
