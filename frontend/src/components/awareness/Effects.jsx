const EFFECTS = [
  {
    icon: "/palm-tree.png",
    title: "Loss of Shoreline",
    description: "Beaches and coastal land gradually shrink as erosion continues.",
    bg: "#dfd5ea",
  },
  {
    icon: "/infrastructure-damage.png",
    title: "Damage to Infrastructure",
    description:
      "Homes, roads, and coastal facilities may be damaged by shoreline retreat.",
    bg: "#f0e1da",
  },
  {
    icon: "/habitat-loss.png",
    title: "Loss of Coastal Habitats",
    description:
      "Mangroves, coral reefs, and other coastal ecosystems may be affected.",
    bg: "#d4efef",
  },
  {
    icon: "/coastal-hazards.png",
    title: "Increased Coastal Hazards",
    description:
      "Eroded coastlines become more vulnerable to waves and storm surges.",
    bg: "#eaf4f8",
  },
];

export default function Effects() {
  return (
    <div className="effects-cards">
      {EFFECTS.map((item) => (
        <div
          className="effects-card"
          style={{ backgroundColor: item.bg }}
          key={item.title}
        >
          <img src={item.icon} alt={item.title} className="effects-card-icon" />
          <h4>{item.title}</h4>
          <p>{item.description}</p>
        </div>
      ))}
    </div>
  );
}
