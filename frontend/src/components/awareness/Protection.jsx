const HARD_ENGINEERING = [
  {
    title: "Seawalls",
    image: "/HE1.jpg",
    description:
      "Concrete, steel, or stone walls built along the shoreline to absorb wave energy and protect coastal areas from erosion and flooding.",
  },
  {
    title: "Groynes",
    image: "/HE2.jpg",
    description:
      "Structures built perpendicular to the shoreline that trap sand carried by waves, helping reduce beach erosion.",
  },
  {
    title: "Gabions",
    image: "/HE3.jpg",
    description:
      "Wire mesh baskets filled with rocks and placed along the coast to reduce wave impact and protect the shoreline.",
  },
  {
    title: "Revetments",
    image: "/HE4.jpg",
    description:
      "Sloping structures made of concrete, rocks, or other materials that absorb wave energy and help reduce shoreline erosion.",
  },
  {
    title: "Tetrapods",
    image: "/HE5.webp",
    description:
      "Interlocking concrete blocks placed along the coast to break incoming waves and reduce their force before they reach the shore.",
  },
];

const SOFT_ENGINEERING = [
  {
    title: "Coastal Dune Afforestation",
    image: "/SE1.webp",
    description:
      "Planting vegetation on coastal dunes to stabilize the sand, reduce wind erosion, and help protect the shoreline.",
  },
  {
    title: "Dune Regeneration",
    image: "/SE2.jpg",
    description:
      "Restoring damaged sand dunes and their vegetation so they can act as natural barriers against wave energy.",
  },
  {
    title: "Beach Nourishment",
    image: "/SE3.jpg",
    description:
      "Adding sand or similar materials to widen the beach and replace sand that has been lost due to erosion.",
  },
  {
    title: "Makeshift Sandbags",
    image: "/SE4.webp",
    description:
      "Placing sand-filled bags along the shoreline as a temporary measure to reduce wave impact and help prevent coastal flooding.",
  },
  {
    title: "Managed Retreat",
    image: "/SE5.jpg",
    description:
      "Allowing vulnerable coastal areas to return to their natural state by relocating development away from the shoreline, reducing future erosion risks.",
  },
  {
    title: "Mangrove and Seagrass Preservation",
    image: "/SE6.webp",
    description:
      "Protecting and maintaining mangroves and seagrass beds, which reduce wave energy, trap sediments, and help prevent coastal erosion.",
  },
];

const ECOSYSTEM_BASED = [
  {
    title: "Coral Reef Restoration",
    image: "/EB1.jpg",
    description:
      "Protecting and restoring coral reefs to reduce wave energy and help protect coastlines from erosion.",
  },
  {
    title: "Eco-type Revetments",
    image: "/EB2.jpg",
    description:
      "Specially designed revetments that reduce wave impact while providing habitats for coastal plants and marine organisms.",
  },
];

function ProtectionColumn({ title, description, items, variant }) {
  return (
    <div className={`protection-column protection-column-${variant}`}>
      <h3>{title}</h3>
      <p className="protection-column-description">{description}</p>
      <div className="protection-items">
        {items.map((item) => (
          <div className="protection-item" key={item.title}>
            <img src={item.image} alt={item.title} className="protection-item-image" />
            <div className="protection-item-content">
              <h4>{item.title}</h4>
              <p>{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProtectionEcosystem() {
  return (
    <div className="protection-ecosystem">
      <h3>Ecosystem-Based / Hybrid Solutions</h3>
      <p className="protection-ecosystem-description">
        Solutions that combine natural ecosystems with engineered structures for coastal protection.
      </p>
      <div className="protection-ecosystem-items">
        {ECOSYSTEM_BASED.map((item) => (
          <div className="protection-item" key={item.title}>
            <img src={item.image} alt={item.title} className="protection-item-image" />
            <div className="protection-item-content">
              <h4>{item.title}</h4>
              <p>{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProtectionInfoBox() {
  return (
    <div className="protection-info-box">
      <img src="/information.png" alt="" className="protection-info-icon" />
      <div className="protection-info-text">
        <p>
          The educational materials on this page are based on official publications from the
          Department of Environment and Natural Resources (DENR) and the Mines and Geosciences
          Bureau (MGB). For additional information, please visit their official websites:
        </p>
        <ul>
          <li>
            DENR:{" "}
            <a href="https://denr.gov.ph" target="_blank" rel="noopener noreferrer">
              https://denr.gov.ph
            </a>
          </li>
          <li>
            MGB:{" "}
            <a href="https://mgb.gov.ph" target="_blank" rel="noopener noreferrer">
              https://mgb.gov.ph
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default function Protection() {
  return (
    <>
      <div className="protection-columns">
        <ProtectionColumn
          title="Hard Engineering"
          description="Man-made structures built to protect the coastline from waves and erosion."
          items={HARD_ENGINEERING}
          variant="hard"
        />
        <ProtectionColumn
          title="Soft Engineering"
          description="Natural approaches that work with coastal processes to reduce erosion."
          items={SOFT_ENGINEERING}
          variant="soft"
        />
      </div>
      <ProtectionEcosystem />
      <ProtectionInfoBox />
    </>
  );
}
