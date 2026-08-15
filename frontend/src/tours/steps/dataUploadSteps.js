import { TUTORIAL_COMPLETE_STANDARD } from "../sharedCopy";

// sets uploadType to "ndwi" then waits two animation frames for React to commit before scrolling to the target
const scrollNdwiTargetIntoView = (setUploadType, selector) => () =>
  new Promise((resolve) => {
    setUploadType("ndwi");
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        document.querySelector(selector)?.scrollIntoView({ block: "center", behavior: "instant" });
        requestAnimationFrame(resolve);
      })
    );
  });

export function buildDataUploadSteps(setUploadType) {
  return [
    {
      target: "body",
      placement: "center",
      title: "Welcome to Data Upload",
      content:
        "The Data Upload page allows administrators to generate NDWI (Normalized Difference Water Index) satellite imagery for coastal erosion analysis. Enter a bounding box, municipality, and coastline name, then generate a single year or all available years at once — each image is automatically analyzed and saved, with no separate upload step required. You can continue this guide by clicking the 'Next' button or close it at any time. To reopen the guide, simply click the Information (i) icon available on the page.",
    },
    {
      target: "#ndwi-generator-fields",
      placement: "bottom",
      title: "NDWI Generator",
      before: scrollNdwiTargetIntoView(setUploadType, "#ndwi-generator-fields"),
      content:
        "The NDWI Generator uses Google Earth Engine to generate NDWI satellite imagery. Enter the required information: Latitude Min (South), Latitude Max (North), Longitude Min (West), Longitude Max (East), Municipality, and Coastline Name. These values define the area that will be processed.",
    },
    {
      target: "#generate-ndwi-btn",
      placement: "top",
      title: "Generate This Year",
      before: scrollNdwiTargetIntoView(setUploadType, "#generate-ndwi-btn"),
      content:
        "Enter a Year, then click Generate This Year. The image is generated and automatically analyzed for shoreline data in one step — a confirmation message appears once it's done.",
    },
    {
      target: "#generate-ndwi-all-years-btn",
      placement: "top",
      title: "Generate All Years",
      before: scrollNdwiTargetIntoView(setUploadType, "#generate-ndwi-all-years-btn"),
      content:
        "Click Generate All Years to process every available year (2015 to present) for this area in one go. This runs in the background — a progress bar shows how many years are complete, and a summary appears once the batch finishes, including any years that were skipped and why. Feeding more years into the system makes the projected Linear Regression Rate (LRR) more statistically reliable.",
    },
    {
      target: "body",
      placement: "center",
      title: "Tutorial Complete!",
      content: TUTORIAL_COMPLETE_STANDARD,
    },
  ];
}
