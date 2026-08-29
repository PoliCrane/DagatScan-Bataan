export function StaticPageShell({ title, backgroundImage = "/tempoaboutBG.jpg", children }) {
  return (
    <div className="public-page-offset w-full px-4 py-6 sm:px-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-4xl">
        <div
          className="relative mb-8 overflow-hidden rounded-card border border-[#c4e6ff] p-10 text-center shadow-card md:mb-10"
          style={{ backgroundImage: `url('${backgroundImage}')`, backgroundSize: "cover", backgroundPosition: "center" }}
        >
          <div className="absolute inset-0 bg-white/70" />
          <h1 className="relative m-0 font-sans text-3xl font-bold text-navy md:text-4xl">{title}</h1>
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
        <h3
          className="m-0 inline-block rounded-lg border px-3 py-1 font-sans text-lg font-bold text-white md:text-xl"
          style={{
            background:
              "radial-gradient(120% 220% at 10% 0%, rgba(56, 189, 248, 0.22), transparent 70%), linear-gradient(90deg, rgba(10, 30, 56, 0.92), rgba(6, 20, 40, 0.92))",
            borderColor: "rgba(56, 189, 248, 0.28)",
          }}
        >
          {title}
        </h3>
      </div>
      <div className="space-y-3 text-[15px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}
