/* global gettext */
"use strict"

import Cookies from "js-cookie"
import { popperGenerator, defaultModifiers } from "@popperjs/core/lib/popper-lite"
import flip from "@popperjs/core/lib/modifiers/flip"
import preventOverflow from "@popperjs/core/lib/modifiers/preventOverflow"

const createPopper = popperGenerator({
    defaultModifiers: [...defaultModifiers, flip, preventOverflow]
})

function isValidText(body) {
    return /^[A-Za-z0-9 ğçıöşüĞÇİÖŞÜ#&@$()_+=':%/",.!?*~`[\]{}<>^;\\|-]+$/g.test(body.split(/[\r\n]+/).join())
}

function template(html) {
    // Create a node from string.
    const template = document.createElement("template")
    template.innerHTML = html.trim()
    return template.content.firstChild
}

// https://stackoverflow.com/questions/5999118/how-can-i-add-or-update-a-query-string-parameter
function updateQueryStringParameter(uri, key, value) {
    const re = new RegExp("([?&])" + key + "=.*?(&|$)", "i")
    const separator = uri.indexOf("?") !== -1 ? "&" : "?"
    if (uri.match(re)) {
        return uri.replace(re, "$1" + key + "=" + value + "$2")
    } else {
        return uri + separator + key + "=" + value
    }
}

const entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "$": "&#36;",
}

function notSafe(string) {
    return String(string).replace(/[&<>"'$]/g, function (s) {
        return entityMap[s]
    })
}

let toastQueue = 0

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function notify(message, level = "default", initialDelay = 1800, persistent = false) {
    if (toastQueue > 5) { return }
    const toastHolder = document.querySelector(".toast-holder")
    const delay = initialDelay + (toastQueue * 1000)
    const toastTemplate = `
        <div role="alert" aria-live="assertive" aria-atomic="true" class="toast fade showing">
            <div class="toast-body ${level}">
                <div class="toast-content">
                    <span>${message}</span>
                    ${persistent ? `<button type="button" class="ml-2 close" data-dismiss="toast" aria-label="${gettext("Close")}"><span aria-hidden="true">&times;</span></button>` : ""}
                </div>
            </div>
        </div>`
    const toast = template(toastTemplate)
    toastHolder.prepend(toast)

    if (persistent) {
        toast.addEventListener("click", async event => {
            if (event.target.closest("[data-dismiss=toast]")) {
                toast.classList.remove("show")
                await sleep(100)
                toast.remove()
            }
        })
    }

    await sleep(50)
    toast.classList.add("show")

    if (!persistent) {
        toastQueue += 1
        await sleep(delay)
        toast.classList.remove("show")
        toastQueue -= 1
        await sleep(100)
        toast.remove()
    }
}

function gqlc(data, failSilently = false, failMessage = gettext("something went wrong")) {
    const headers = new Headers({
        "Content-Type": "application/json",
        "X-CSRFToken": Cookies.get("csrftoken")
    })

    const options = {
        method: "POST",
        headers,
        mode: "same-origin",
        body: JSON.stringify(data)
    }

    const errorHandler = () => {
        if (!failSilently) {
            notify(failMessage, "error")
        }
        return { errors: [failMessage] }
    }

    return fetch("/graphql/", options).then(response => {
        if (response.ok) {
            return response.json()
        }
        return errorHandler()
    }).catch(() => {
        return errorHandler()
    })
}

const cookies = Cookies.withConverter({
    read(value) {
        return decodeURIComponent(value)
    },
    write(value) {
        return encodeURIComponent(value)
    }
}).withAttributes({ sameSite: "Lax" })

// DOM

function toggleText(el, a, b) {
    el.textContent = el.textContent === b ? a : b
}

const many = document.querySelectorAll.bind(document)
const one = document.querySelector.bind(document)

const isString = obj => typeof obj === "string" || obj instanceof String

function Handle(node, type, callback, ...args) {
    // Shortcut for node.addEventListener, that fail silently when node is non-existent.
    if (isString(node)) {
        node = one(node)
    }

    if (!node) {
        return
    }

    node.addEventListener(type, callback, ...args)
}

function Handler(nodes, type, callback, ...args) {
    // Handle, but for multiple nodes.
    if (isString(nodes)) {
        nodes = many(nodes)
    }

    nodes.forEach(node => {
        node.addEventListener(type, callback, ...args)
    })
}

const userIsAuthenticated = one("body").id === "au"
const lang = document.documentElement.lang

export {
    cookies, many, one, notify, gqlc,
    notSafe, template, Handle, Handler, sleep,
    isValidText, updateQueryStringParameter, toggleText,
    createPopper, userIsAuthenticated, lang
}
const formatTime = (date) => (lang === "en" ? 
    date.toLocaleString('en-US', {timeStyle: "short"}).toLowerCase() : date.toLocaleString('tr-TR', {timeStyle:'short'}))
const formatDate = (date) => (lang === "en" ?
    date.toLocaleString('en-US', {dateStyle: "medium"}) : date.toLocaleString('tr-TR', {dateStyle:'short'}))

function formatDateTime(date) {
    date = new Date(date)
    return `${formatDate(date)} ${formatTime(date)}`
}

function entryDate(created, edited) {
    created = new Date(created)
    const [d1, t1] = [formatDate(created), formatTime(created)]
    if (!edited) return `${d1} ${t1}`
    edited = new Date(edited)
    const [d2, t2] = [formatDate(edited), formatTime(edited)]
    return d1 === d2 ? `${d1} ${t1} ~ ${t2}` : `${d1} ${t1} ~ ${d2} ${t2}`
}

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".date:not(.date-month)").forEach(time => 
        time.innerText = entryDate(time.dateTime, time.dataset.editDate)
    )
    document.querySelectorAll(".code-container pre code").forEach(code => {
        code.innerHTML = code.innerHTML.replaceAll("<br>", "\n")
    })

})