import {MODULE_ID} from "./constants.mjs";
import {openGallerySourceDialog} from "./source-config.mjs";
import {updateActorData} from "./helpers.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

/**
 * An Application instance that creates an art gallery / enhanced file picker.
 */
export default class GalleryApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {Map<string, CharacterArtData>} */
  #database = this.#buildDatabase();

  #dragDrop = this.#createDragDropHandlers();

  #searchFilter = new SearchFilter({
    inputSelector: "input[type=search]",
    contentSelector: "[data-application-part=grid] > .grid",
    callback: this.#onSearch
  });

  static DEFAULT_OPTIONS = {
    id: "character-gallery",
    sheetConfig: true,
    window: {
      icon: "fa-solid fa-palette",
      title: "Character Gallery",
      frame: true,
      resizable: true,
      controls: [
        // {
        //   label: "Configure Sources",
        //   icon: "fa-solid fa-wrench",
        //   action: "openGallerySourceDialog"
        // }
      ]
    },
    position: {
      width: 1160,
      height: 720
    },
    actions: {
      collapseGroup: GalleryApplication.#collapseGroup,
      createActor: GalleryApplication.#createActor,
      openGallerySourceDialog,
      replaceArtwork: GalleryApplication.#replaceArtwork,
      resetTags: GalleryApplication.#resetTags,
      selectImage: GalleryApplication.#selectImage,
      togglePreview: GalleryApplication.#togglePreview,
      inspectImage: GalleryApplication.#inspectImage,
      toggleTag: GalleryApplication.#toggleTag
    },
    dragDrop: [{dragSelector: "div.preview"}]
  };

  get database() {
    return this.#database;
  }

  // ======================================= //
  //               Templates                 //
  // ======================================= //

  /** @override */
  static PARTS = Object.fromEntries(
    ["search", "tags", "grid", "details"].map((k) => [k, {template: `modules/${MODULE_ID}/templates/${k}.hbs`}])
  );

  // ======================================= //
  //               Data prep                 //
  // ======================================= //

  /**
   * Accrue available source data for use by the gallery application
   * @returns {Map<string, CharacterArtData>}
   */
  #buildDatabase() {
    const database = new Map();
    const sources = CharacterGallery.DATA.SOURCES;

    // Adds sources that are enabled (should probably change visibility to "enabled")
    const allData = sources.flatMap((s) => s.data).sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
    for (const data of allData) {
      database.set(data.key, data);
    }

    return database;
  }

  /** @override */
  async _prepareContext(_options = {}) {
    // Filtering functionality
    const displayData = Array.from(this.#database.values()).map((e) => ({
      ...e,
      allTags: Object.values(e.tags)
        .flat()
        .filter((t) => !!t)
    }));
    const selectedKey = CharacterGallery.sessionSettings.selected;
    const selectedEntry = this.#database.get(selectedKey);

    return {
      id: this.id,
      // whether the showcase panel is previewing tokens or portraits
      preview: CharacterGallery.sessionSettings.preview,
      // the actor that was used to open the application (and thus that will be "targeted" by the form)
      targetActor: CharacterGallery.sessionSettings.targetActor,
      // the full list of tag groups
      tagGroups: CharacterGallery.DATA.TAGS.groups,
      // all potential sources
      sources: CharacterGallery.DATA.SOURCES,
      // the array of entries that was created by applying filters to the database
      // these are the entries that will be displayed in the gallery's central tab
      displayData,
      // the number of entries in the displayData array
      resultsCount: displayData.length,
      // the currently selected entry in the database, used to populate the showcase panel
      selected: selectedEntry
    };
  }

  // ======================================= //
  //               Enrichment                //
  // ======================================= //

  /** Creates a new DragDrop controller object using the values from our options */
  #createDragDropHandlers() {
    return this.options.dragDrop.map((dragDrop) => {
      dragDrop.callbacks = {
        dragstart: this.#onDragStart.bind(this),
        drop: this.#onDrop.bind(this)
      };
      return new DragDrop(dragDrop);
    });
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Bind drag drop listeners
    for (const dragDrop of this.#dragDrop) {
      dragDrop.bind(this.element);
    }

    if (options.parts.includes("tags")) {
      // Move filter tags to left sidebar
      const sidebar = this.element.querySelector("aside[data-application-part=search]");
      const tags = this.element.querySelector("[data-application-part=tags]");
      sidebar.appendChild(tags);

      // Check the current tag filter settings and colour the tag buttons according to their filter status. Also adds
      // the event listeners for the click and right click events.
      const filters = CharacterGallery.DATA.TAGS.filters;
      for (const button of this.element.querySelectorAll("button.tag")) {
        const key = button.dataset.tag;
        const tag = filters[key] ?? {state: null};
        // Add CSS class for colour-coding based on current filter status
        button.classList.toggle("include", tag.state === "include");
        button.classList.toggle("exclude", tag.state === "exclude");
        button.addEventListener("contextmenu", (event) => {
          GalleryApplication.#toggleTag.call(this, event, event.currentTarget);
        });
      }
    }

    if (options.parts.includes("grid")) {
      this.#searchFilter.bind(this.element);
      this._updateGridDisplay();
    }
  }

  #onSearch(_event, _str, regex, grid) {
    let resultsCount = 0;
    for (const cell of grid.querySelectorAll(":scope > *")) {
      cell.hidden = !regex.test(cell.dataset.label);
      const isVisible = !cell.hidden && !cell.classList.contains("excluded");
      resultsCount += Number(isVisible);
    }
    const countEl = document.body.querySelector("#character-gallery .results > .count");
    countEl.innerText = resultsCount;
  }

  // =================================================================== //
  //                                                                     //
  //                           Interactivity                             //
  //                                                                     //
  // =================================================================== //

  // ======================================= //
  //               DragDrop                  //
  // ======================================= //

  /** Callback actions which occur when an element is dragged. */
  #onDragStart(event) {
    // Fetch entry's data for transfer
    const key = event.currentTarget.dataset.key;
    const data = this.#database.get(key);
    event.dataTransfer.setData("text/plain", JSON.stringify(data));
    // Look for valid drop points (open actor sheets & actor sidebar entries) & add drop logic to them
    const actorSheets = document.querySelectorAll("div.window-app.actor");
    const sidebarEntries = document.querySelectorAll("li.directory-item.actor");
    const dropzones = [...actorSheets, ...sidebarEntries];
    dropzones.forEach((element) => {
      this.#dragDrop[0].bind(element);
    });
  }

  /** Callback actions which occur when a dragged element is dropped on a target. */
  async #onDrop(event) {
    const target = event.currentTarget;
    // Get the actor document (approach depends on what we have dropped onto)
    const actor = ["actor", "sheet"].every((c) => target.classList.contains(c))
      ? ui.windows[target.dataset.appid]?.actor
      : target.classList.contains("directory-item")
        ? game.actors.get(target.dataset.documentId)
        : null;
    if (actor) {
      // Replace that actor's artwork with the dropped entry
      const data = TextEditor.getDragEventData(event);
      updateActorData(actor, data);
    }
  }

  /**
   * Updates the filters object when a tag is clicked
   * @param {string} key tag with which to operate
   * @param {"include"|"exclude"|null} state the display state in the gallery
   * @param {"forward"|"backward"} direction the direction to move in the include/exclude/null cycle
   */
  _toggleTagState(key, group, oldState, direction) {
    const newState = (
      direction === "forward"
        ? {null: "include", include: "exclude", exclude: null}
        : {null: "exclude", include: null, exclude: "include"}
    )[oldState];

    if (newState === null) {
      delete CharacterGallery.DATA.TAGS.filters[key];
    } else {
      CharacterGallery.DATA.TAGS.filters[key] = {
        key,
        state: newState,
        group
      };
    }

    // Update the state of the tag element
    const tagEl = this.parts.tags.querySelector(`button[data-group=${group}][data-tag=${key}]`);
    tagEl.classList.toggle("include", newState === "include");
    tagEl.classList.toggle("exclude", newState === "exclude");

    this._updateGridDisplay();
  }

  /**
   * Update the display state of each cell in the grid.
   * @internal
   */
  _updateGridDisplay() {
    const gridEl = this.parts.grid.firstElementChild;
    const filters = Object.values(
      Object.values(CharacterGallery.DATA.TAGS.filters).reduce((byGroup, filter) => {
        const group = (byGroup[filter.group] ??= {include: [], exclude: []});
        group[filter.state].push(filter.key);
        return byGroup;
      }, {})
    );

    const selectedKey = CharacterGallery.sessionSettings.selected;
    let resultsCount = 0;
    for (const cell of gridEl.children) {
      const tags = cell.dataset.tags.split(",");
      const isIncluded = filters.every(
        (f) =>
          (f.include.length === 0 || tags.some((t) => f.include.includes(t))) &&
          (f.exclude.length === 0 || tags.every((t) => !f.exclude.includes(t)))
      );
      cell.classList.toggle("excluded", !isIncluded);
      cell.classList.toggle("selected", cell.dataset.key === selectedKey);
      const isVisible = !cell.hidden && isIncluded;
      resultsCount += Number(isVisible);
    }
    const countEl = document.body.querySelector("#character-gallery .results > .count");
    countEl.innerText = resultsCount;
  }

  // ======================================= //
  //                Actions                  //
  // ======================================= //

  /** Create a new actor from the current selection. */
  static async #createActor() {
    const selectedKey = CharacterGallery.sessionSettings.selected;
    const data = this.database.get(selectedKey);
    const Actor = getDocumentClass("Actor");
    const nameCollisions = game.actors.filter((a) => a.name === data.label).length;
    const name = nameCollisions > 0 ? `${data.label} (${nameCollisions})` : data.label;
    await Actor.create(
      {
        name,
        type: "npc",
        img: data.art.portrait,
        prototypeToken: {
          ring: {
            enabled: true,
            subject: {
              texture: data.art.subject,
              scale: data.art.scale ?? 1
            }
          },
          texture: {
            src: data.art.token,
            scaleX: data.art.scale,
            scaleY: data.art.scale
          }
        }
      },
      {renderSheet: true}
    );
  }

  /**
   * Mark the clicked image as selected so that it's highlighted in the right panel
   * @param {event} event the triggering event
   */
  static async #selectImage(_event, target) {
    CharacterGallery.sessionSettings.selected = target.dataset.key;
    await CharacterGallery.application.render({parts: ["details"]});
    this._updateGridDisplay();
  }

  static async #toggleTag(event, button) {
    const {tag: key, group} = button.dataset;
    const filters = CharacterGallery.DATA.TAGS.filters;
    const tag = filters[key] ?? {state: null};
    const direction = event.type === "click" ? "forward" : "backward";
    this._toggleTagState(key, group, tag.state, direction);
  }

  /**
   * Wipe the active filters
   * @param {event} event the triggering event
   */
  static async #resetTags() {
    CharacterGallery.DATA.TAGS.filters = {};
    await CharacterGallery.application.render({parts: ["tags", "grid"]});
  }

  /** Collapse or expand a tag group's fieldset */
  static async #collapseGroup(_event, target) {
    const group = target.dataset.group;
    CharacterGallery.DATA.TAGS.groups[group].collapsed = !CharacterGallery.DATA.TAGS.groups[group].collapsed;
    CharacterGallery.application.render({parts: ["tags"]});
  }

  /** Update the "target" actor with the selected artwork */
  static async #replaceArtwork() {
    const selectedKey = CharacterGallery.sessionSettings.selected;
    const data = this.database.get(selectedKey);
    const targetActor = CharacterGallery.sessionSettings.targetActor;
    await updateActorData(targetActor, data);
    CharacterGallery.application.render({parts: ["details"]});
  }

  /** Collapses or expands a tag group's fieldset */
  static async #togglePreview() {
    CharacterGallery.sessionSettings.preview =
      CharacterGallery.sessionSettings.preview === "portrait" ? "token" : "portrait";
    CharacterGallery.application.render({parts: ["details"]});
  }

  static async #inspectImage() {
    const selectedKey = CharacterGallery.sessionSettings.selected;
    const data = this.database.get(selectedKey);
    const mode = CharacterGallery.sessionSettings.preview;
    const imagePopout = new ImagePopout(data.art[mode] || data.art.portrait, {
      title: data.label ?? "",
      shareable: true
    });
    imagePopout.render(true);
  }
}
