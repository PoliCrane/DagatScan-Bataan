const NATURAL_PROCESSES = [
  {
    icon: "/waves.png",
    title: "Waves",
    description: "Continuous wave action gradually wears away the shoreline.",
  },
  {
    icon: "/tides.png",
    title: "Tides",
    description:
      "The rise and fall of tides move sand and change the shoreline over time.",
  },
  {
    icon: "/causes.png",
    title: "Coastal Currents",
    description:
      "Ocean currents carry sand along the coast, causing erosion in some areas.",
  },
  {
    icon: "/storms.png",
    title: "Storms",
    description:
      "Strong storms and storm surges can quickly erode beaches and coastlines.",
  },
];

const HUMAN_INTERVENTIONS = [
  {
    icon: "/development.png",
    title: "Coastal Development",
    description:
      "Buildings and coastal structures can disrupt the natural movement of sand.",
  },
  {
    icon: "/tree.png",
    title: "Removal of Coastal Vegetation",
    description:
      "Removing mangroves and coastal plants reduces natural protection from waves.",
  },
  {
    icon: "/sand.png",
    title: "Sand Mining",
    description:
      "Taking sand from beaches reduces the sediment needed to maintain the shoreline.",
  },
  {
    icon: "/construction.png",
    title: "Shoreline Structures",
    description:
      "Poorly planned shoreline structures may increase erosion in nearby areas.",
  },
];

function CausesColumn({ title, items, variant }) {
  return (
    <div className={`causes-column causes-column-${variant}`}>
      <h3>{title}</h3>
      {items.map((item) => (
        <div className="causes-item" key={item.title}>
          <img src={item.icon} alt={item.title} className="causes-item-icon" />
          <div className="causes-item-content">
            <h4>{item.title}</h4>
            <p>{item.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Causes() {
  return (
    <div className="causes-columns">
      <CausesColumn title="Natural Processes" items={NATURAL_PROCESSES} variant="natural" />
      <CausesColumn title="Human Interventions" items={HUMAN_INTERVENTIONS} variant="human" />
    </div>
  );
}
