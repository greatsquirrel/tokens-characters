import {MODULE_ID} from "./constants.mjs";

/* A function that opens a popout dialog window displaying a list of active sources in the world and allowing them to be individually toggled on and off */
async function openGallerySourceDialog() {
  const data = {
    isGM: game.user.isGM,
    sources: CharacterGallery.sessionSettings.sourceSettings
  };
  const content = await renderTemplate(`modules/${MODULE_ID}/templates/source-config.hbs`, data);
  return foundry.applications.api.DialogV2.wait({
    window: {title: "Configure Gallery Sources"},
    content,
    modal: true,
    buttons: [
      {
        label: "Cancel",
        action: "cancel",
        callback: () => {
          console.log("cancel");
        }
      },
      {
        label: "Reset to Defaults",
        action: "reset",
        callback: () => {
          // resetStoredSourceSettings(["sourceVisibility", "sourcePermission"]);
        }
      },
      {
        label: "Apply",
        action: "updateSources"
        // callback: (event, button, dialog) => {
        //   updateStoredSourceSettings(event, button, dialog);
        // }
      }
    ]
  });
}

export {openGallerySourceDialog};
