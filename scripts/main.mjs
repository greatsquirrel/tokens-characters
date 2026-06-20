import {MODULE_ID} from "./constants.mjs";
import GalleryApplication from "./gallery.mjs";
import {DEFAULT_SETTINGS, GALLERY_DATA} from "./data.mjs";

/* global CONST */

// ======================================= //
//                  Init                   //
// ======================================= //

Hooks.once("init", () => {
  // Create references to data & settings for easier access
  globalThis.CharacterGallery = game.modules.get(MODULE_ID);
  // Temporary settings that are reset each session (defaults loaded from gallery-config.mjs)
  CharacterGallery.DATA = GALLERY_DATA;
  CharacterGallery.sessionSettings = DEFAULT_SETTINGS;
  const USER_ROLES = {
    1: "USER.RolePlayer",
    2: "USER.RoleTrusted",
    3: "USER.RoleAssistant",
    4: "USER.RoleGamemaster"
  };

  game.settings.register(MODULE_ID, "galleryAccess", {
    name: "Gallery Access Permission",
    hint: "Sets a minimum user permission level required to access the gallery application.",
    scope: "world",
    config: "true",
    type: Number,
    choices: USER_ROLES,
    default: CONST.USER_ROLES.ASSISTANT
  });

  game.settings.register(MODULE_ID, "headerButton", {
    name: "Actor Sheet Header Button",
    hint: "Show a button in the header bar of actor sheets to open the gallery application.",
    scope: "world",
    config: "true",
    type: Boolean,
    default: true
  });

  // Initialise the gallery application
  CharacterGallery.application = new GalleryApplication();
});

// ======================================= //
//               Listeners                 //
// ======================================= //

const hasPermission = () => {
  const minimumRole = game.settings.get(MODULE_ID, "galleryAccess");
  return game.user.hasRole(minimumRole);
};

/** Wait for the actor sheet render hook, add a header button that opens the NPC gallery */
Hooks.on("getActorSheetHeaderButtons", (app, buttons) => {
  if (!game.settings.get(MODULE_ID, "headerButton")) return;
  if (!hasPermission()) return;
  buttons.unshift({
    class: "render-gallery",
    icon: "fa-solid fa-palette",
    label: "Gallery",
    onclick: () => {
      CharacterGallery.sessionSettings.targetActor = app.actor;
      CharacterGallery.application.render({force: true});
    }
  });
});

Hooks.on("renderActorDirectory", (app) => {
  if (!hasPermission()) return;
  const button = document.createElement("button");
  button.innerHTML = '<i class="fa-solid fa-palette fa-fw"></i> Character Gallery';
  button.addEventListener("click", () => {
    CharacterGallery.application.render({force: true});
  });
  const footer = app.element[0].querySelector("footer.directory-footer");
  footer?.append(button);
});
