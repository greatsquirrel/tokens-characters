/**
 * Function that updates an actor with the data from a given entry
 * @type {method}
 * @param {object} actor An actor document
 * @param {object} data A single entry from the database
 */
async function updateActorData(actor, data) {
  const art = data.art;

  // Create a confirmation popup before overwriting the image
  const userPrompt = foundry.applications.api.DialogV2.confirm({
    window: {
      title: "Replace Actor Artwork",
      width: 400
    },
    content: `
            <section>
              <p>You are about to change the portrait, token, and subject images for the actor ${actor.name}.</p>
              <p>Would you like to proceed?</p>
            <section>
            <section class="flexrow">
              <figure>
                <img width="160" style="border: none" alt="Current Portrait" src="${actor.img}">
                <figcaption>Current Portrait</figcaption>
              </figure>
              <img style="transform: rotate(90deg); max-width: 32px; border: none" width="32" alt="Arrow pointing to the right" src="icons/svg/upgrade.svg">
              <figure>
                <img width="160" style="border: none" alt="New Portrait" src="${art.portrait}">
                <figcaption>New Portrait</figcaption>
              </figure>
            </section>
            `,
    modal: true
  });

  if ((await userPrompt) === false) {
    ui.notifications.info("Image assignment cancelled by user.");
    return;
  }

  // Apply the new settings to the actor
  await actor.update({
    img: art.portrait,
    prototypeToken: {
      ring: {
        enabled: true,
        subject: {
          texture: art.subject,
          scale: art.scale ?? 1
        }
      },
      texture: {
        src: art.token,
        scaleX: art.scale ?? 1,
        scaleY: art.scale ?? 1
      },
      // Only necessary in PF2E system, may not be needed at all in the future? See issue #16
      flags: {
        pf2e: {
          autoscale: false
        }
      }
    }
  });

  CharacterGallery.application.render({parts: ["details"]});
}

export {updateActorData};
