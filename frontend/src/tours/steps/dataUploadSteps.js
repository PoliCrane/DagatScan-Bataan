import { TUTORIAL_COMPLETE_STANDARD } from "../sharedCopy";

// The NDWI Generator and Satellite Image Upload cards are mutually
// exclusive again (a toggle switches between them), so a step targeting
// either card's contents first has to flip DataUpload.jsx's `uploadType`
// state before Joyride can measure/spotlight it — plain scrollIntoView
// (see the shared scrollTargetIntoView.js, used on pages where everything
// is always mounted) isn't enough on its own here. switchTabAndScroll does
// both: set the tab, wait two animation frames for React to commit and lay
// out the newly-mounted card, then scroll the target into view.
const switchTabAndScroll = (tab, setUploadType, selector) => () =>
  new Promise((resolve) => {
    setUploadType(tab);
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
        "The Data Upload page allows administrators to generate and upload NDWI (Normalized Difference Water Index) satellite images for coastal erosion analysis. Use the toggle at the top to switch between the NDWI Generator (generate and download an NDWI image) and Satellite Image Upload (upload it and complete the required location details). You can continue this guide by clicking the 'Next' button or close it at any time. To reopen the guide, simply click the Information (i) icon available on the page.",
    },
    {
      target: "#ndwi-generator-fields",
      placement: "bottom",
      title: "NDWI Generator",
      before: switchTabAndScroll("ndwi", setUploadType, "#ndwi-generator-fields"),
      content:
        "The NDWI Generator allows you to generate an NDWI satellite image using Google Earth Engine. Enter the required information: Latitude Min (South), Latitude Max (North), Longitude Min (West), Longitude Max (East), Year, Coastline Name (Optional). These values define the area and year of the satellite imagery that will be processed.",
    },
    {
      target: "#generate-ndwi-btn",
      placement: "top",
      title: "Generate NDWI Image",
      before: switchTabAndScroll("ndwi", setUploadType, "#generate-ndwi-btn"),
      content:
        "After entering the required information, click the Generate NDWI Image button. Once the image is generated, a message will appear below the form indicating that the file is ready. Click the highlighted Download link to save the NDWI image, then switch to the Satellite Image Upload tab to upload it.",
    },
    {
      target: ".upload-drop-zone.satellite-dropzone",
      placement: "right",
      title: "Satellite Image Upload",
      before: switchTabAndScroll("satellite", setUploadType, ".upload-drop-zone.satellite-dropzone"),
      content:
        "The Satellite Image Upload card lets you upload the generated NDWI image or other satellite images. Drag and drop an image into the upload area or click the upload box to browse your files.",
    },
    {
      target: ".satellite-bounds-col",
      placement: "left",
      title: "Image Bounds",
      before: switchTabAndScroll("satellite", setUploadType, ".satellite-bounds-col"),
      content:
        "If you upload an NDWI or .tif image, entering the image bounds is optional. For other image formats (such as .jpg or .png), providing the North, South, West, and East coordinates is recommended for more accurate shoreline processing.",
    },
    {
      target: ".location-metadata-section",
      placement: "top",
      title: "Location Details",
      before: switchTabAndScroll("satellite", setUploadType, ".location-metadata-section"),
      content:
        "The Location Details section is used for file naming and organizing uploaded satellite images. Enter the required information: Municipality, Specific Area, Year of Data, Data Quality (Confidence Rating).",
    },
    {
      target: "#upload-files-btn",
      placement: "top",
      title: "Upload Files",
      before: switchTabAndScroll("satellite", setUploadType, "#upload-files-btn"),
      content:
        "After completing the required information, click the Upload Files button. A progress bar will appear while the file is being uploaded. Once the upload is complete, the system will display a confirmation message.",
    },
    {
      target: ".btn-reset",
      placement: "top",
      title: "Clear Button",
      before: switchTabAndScroll("satellite", setUploadType, ".btn-reset"),
      content: "Click the Clear button to remove the entered image bounds and reset the coordinate fields.",
    },
    {
      target: "body",
      placement: "center",
      title: "Tutorial Complete!",
      content: TUTORIAL_COMPLETE_STANDARD,
    },
  ];
}
