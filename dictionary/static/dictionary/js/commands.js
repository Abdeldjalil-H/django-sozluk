/* global gettext */

import { Handler, template, notify } from "./utils"

const showRecordErrorMessage = () => {
    notify(gettext("command line record could not be displayed. it might have been deleted."), "error", 2200)
}

Handler("a[data-asciinema]", "click", event => {
    const self = event.target
    if (self.hasAttribute("data-broken")) {
        showRecordErrorMessage()
        return
    }

    if (!self.hasAttribute("data-loaded")) {
        const p = self.parentNode
        p.style.maxHeight = "none" // Click "read more" button.
        const readMore = p.querySelector(".read_more")

        if (readMore) {
            readMore.style.display = "none"
        }

        const id = self.getAttribute("data-asciinema")
        const url = `https://asciinema.org/a/${id}`
        const expander = template(`<a rel="ugc nofollow noopener" title="${gettext("open full player in new tab")}" href="${url}" target="_blank"  style="top: 2px;"></a>`)

        self.nextElementSibling.nextElementSibling.classList.toggle("visible")
        self.after(expander)
        self.setAttribute("aria-expanded", "true")
    } else {
        self.nextElementSibling.classList.toggle("d-none")
        self.nextElementSibling.nextElementSibling.nextElementSibling.classList.toggle("visible")

        if (self.getAttribute("aria-expanded") === "true") {
            self.setAttribute("aria-expanded", "false")
        } else {
            self.setAttribute("aria-expanded", "true")
        }
    }
    self.setAttribute("data-loaded", "true")

})

Handler(".copy-btn", "click", event => {
    const self = event.target
    const text = self.previousElementSibling.innerText
    const el = document.createElement("textarea")
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand("copy")
    document.body.removeChild(el)
    notify(gettext("copied to clipboard"))

    // copy using clipboard api
    // const self = event.target
    // const text = self.previousElementSibling.innerText
    // navigator.clipboard.writeText(text).then(_ => {
    //     notify(gettext("copied to clipboard"))
    // })
})