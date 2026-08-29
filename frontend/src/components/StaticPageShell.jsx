export function StaticPageShell({ title, backgroundImage = "/tempoaboutBG.jpg", children }) {
  return (
    <div className="public-page-offset w-full px-4 py-6 sm:px-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-4xl">
        <div
          className="relative mb-8 overflow-hidden rounded-card border border-[#c4e6ff] p-10 text-center shadow-card md:mb-10"
          style={{ backgroundImage: `url('${backgroundImage}')`, backgroundSize: "cover", backgroundPosition: "center" }}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(70% 55% at 50% 30%, rgba(6, 20, 40, 0.25), transparent 65%), linear-gradient(180deg, rgba(4, 16, 31, 0.45) 0%, rgba(6, 20, 40, 0.2) 40%, rgba(4, 16, 31, 0.55) 100%)",
            }}
          />
          <h1
            className="relative m-0 font-sans text-3xl font-bold text-white md:text-4xl"
            style={{ textShadow: "0 8px 30px rgba(4, 16, 31, 0.8)" }}
          >
            {title}
          </h1>
        </div>
        <div className="space-y-6">{children}</div>
      </div>
    </div>
  );
}

export function StaticPageSection({ icon, title, children }) {
  return (
    <section className="mb-6 rounded-card border border-line bg-card/60 p-5 md:p-6">
      <div className="mb-3 flex items-center gap-3">
        {icon && <img src={icon} alt="" className="h-8 w-8 shrink-0" />}
        <h3 className="m-0 font-sans text-lg font-bold text-primary md:text-xl">{title}</h3>
      </div>
      <div className="space-y-3 text-[15px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}
