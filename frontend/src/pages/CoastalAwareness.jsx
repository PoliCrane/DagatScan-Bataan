import { useState } from "react";
import Layout from "../components/Layout";
import WhatIsErosion from "../components/awareness/WhatIsErosion";
import Causes from "../components/awareness/Causes";
import Effects from "../components/awareness/Effects";
import Protection from "../components/awareness/Protection";
import "./styles/coastalAwareness.css";
import useGuidedTour from "../hooks/useGuidedTour";
import TourInfoButton from "../components/tour/TourInfoButton";
import { TOUR_PAGE_IDS } from "../tours/pageIds";
import { coastalAwarenessSteps } from "../tours/steps/coastalAwarenessSteps";

const TOPICS = [
  {
    id: "what-is",
    icon: "/book.png",
    label: "What is Coastal Erosion",
    heading: "What is Coastal Erosion?",
    Body: WhatIsErosion,
  },
  {
    id: "causes",
    icon: "/causes.png",
    label: "Causes",
    heading: "What Causes Coastal Erosion?",
    Body: Causes,
  },
  {
    id: "effects",
    icon: "/Effects.png",
    label: "Effects",
    heading: "What are the Effects?",
    Body: Effects,
  },
  {
    id: "protection",
    icon: "/protection.png",
    label: "Coastal Protection",
    heading: "Coastal Protection Strategies",
    Body: Protection,
  },
];

export default function CoastalAwareness() {
  const [activeId, setActiveId] = useState(TOPICS[0].id);
  const active = TOPICS.find((t) => t.id === activeId) ?? TOPICS[0];
  const ActiveBody = active.Body;
  const { Tour, replay } = useGuidedTour(TOUR_PAGE_IDS.COASTAL_AWARENESS, coastalAwarenessSteps);

  return (
    <Layout>
      {Tour}
      <TourInfoButton onClick={replay} />
      <div className="awareness-container">
        <div
          className="awareness-hero"
          style={{ backgroundImage: "url('/awareness_tempbg.png')" }}
        >
          <span className="awareness-eyebrow">Coastal Awareness</span>
          <h1>Learn About Coastal Erosion</h1>
          <p>
            Learn about coastal erosion in Bataan—its causes, impacts, and the
            different coastal protection strategies used to help preserve our
            shorelines.
          </p>
        </div>

        <div className="awareness-topic-cards">
          {TOPICS.map((topic) => (
            <button
              key={topic.id}
              className={`awareness-topic-card ${activeId === topic.id ? "active" : ""}`}
              onClick={() => setActiveId(topic.id)}
            >
              <img src={topic.icon} alt={topic.label} />
              <span>{topic.label}</span>
            </button>
          ))}
        </div>

        <div className="awareness-detail">
          <h2>
            <img src={active.icon} alt="" className="awareness-detail-icon" />
            {active.heading}
          </h2>
          <ActiveBody />
        </div>
      </div>
    </Layout>
  );
}
