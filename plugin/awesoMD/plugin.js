/*!
 * The reveal.js markdown plugin. Handles parsing of
 * markdown inside of presentations as well as loading
 * of external markdown documents.
 */

import { marked } from 'marked'
import yaml from 'js-yaml'
import Mustache from 'mustache'
import fm from 'front-matter'

const DEFAULT_SLIDE_SEPARATOR = '\r?\n---\r?\n',
    DEFAULT_VERTICAL_SEPARATOR = null,
    DEFAULT_NOTES_SEPARATOR = '^s*notes?:',
    DEFAULT_ELEMENT_ATTRIBUTES_SEPARATOR = '\\.element\\s*?(.+?)$',
    DEFAULT_SLIDE_ATTRIBUTES_SEPARATOR = '\\.slide:\\s*?(\\S.+?)$'

const SCRIPT_END_PLACEHOLDER = '__SCRIPT_END__'

// match an optional line number offset and highlight line numbers
// [<line numbers>] or [<offset>: <line numbers>]
const CODE_LINE_NUMBER_REGEX = /\[\s*((\d*):)?\s*([\s\d,|-]*)\]/

const HTML_ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
}

const yamlRegex = /```(yaml|yml)\n([\s\S]*?)```(\n[\s\S]*)?/g
const headingWithMetadataRegex = /^#+\s.*::\w+: *\w+.*$/m
const metadataRegex = /::(\w+):([^::\n]*)/g
const alertBlockRegex = /^\r*>\s*(\[!(\w+)\]).*\n(\s*\s*>.*\n?)*/gm
const alertTypeRegex = /^\r*>*\s*(\[!(\w+)\])/gm
const alertMessageRegex = /\r*>\s*[\w].*/gm
const alertRegex = /^\r*>.*$/gm
const regexToGetAlertType = /\[!(\w+)\]/

const alertIcons = {
    note: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>`,
    tip: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"/></svg>`,
    caution: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>`,
    important: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>`,
    warning: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>`,
}

const plugin = () => {
    // The reveal.js instance this plugin is attached to
    let deck

    return {
        id: 'markdown',

        /**
         * Starts processing and converting Markdown within the
         * current reveal.js deck.
         */
        init: function (reveal) {
            deck = reveal

            let { renderer, animateLists, ...markedOptions } = deck.getConfig().markdown || {}

            if (!renderer) {
                renderer = new marked.Renderer()

                renderer.code = (code, language) => {
                    // Off by default
                    let lineNumberOffset = ''
                    let lineNumbers = ''

                    // Users can opt in to show line numbers and highlight
                    // specific lines.
                    // ```javascript []        show line numbers
                    // ```javascript [1,4-8]   highlights lines 1 and 4-8
                    // optional line number offset:
                    // ```javascript [25: 1,4-8]   start line numbering at 25,
                    //                             highlights lines 1 (numbered as 25) and 4-8 (numbered as 28-32)
                    if (CODE_LINE_NUMBER_REGEX.test(language)) {
                        const lineNumberOffsetMatch = language.match(CODE_LINE_NUMBER_REGEX)[2]
                        if (lineNumberOffsetMatch) {
                            lineNumberOffset = `data-ln-start-from="${lineNumberOffsetMatch.trim()}"`
                        }

                        lineNumbers = language.match(CODE_LINE_NUMBER_REGEX)[3].trim()
                        lineNumbers = `data-line-numbers="${lineNumbers}"`
                        language = language.replace(CODE_LINE_NUMBER_REGEX, '').trim()
                    }

                    // Escape before this gets injected into the DOM to
                    // avoid having the HTML parser alter our code before
                    // highlight.js is able to read it
                    code = this.escapeForHTML(code)

                    // return `<pre><code ${lineNumbers} class="${language}">${code}</code></pre>`;

                    return `<pre><code ${lineNumbers} ${lineNumberOffset} class="${language}">${code}</code></pre>`
                }
            }

            if (animateLists === true) {
                renderer.listitem = (text) => `<li class="fragment">${text}</li>`
            }

            marked.setOptions({
                renderer,
                ...markedOptions,
            })

            return this.processSlides(deck.getRevealElement()).then(() => this.convertSlides())
        },

        /**
         * Retrieves the markdown contents of a slide section
         * element. Normalizes leading tabs/whitespace.
         */
        getMarkdownFromSlide: function (section) {
            // look for a <script> or <textarea data-template> wrapper
            const template = section.querySelector('[data-template]') || section.querySelector('script')

            // strip leading whitespace so it isn't evaluated as code
            let text = (template || section).textContent

            // restore script end tags
            text = text.replace(new RegExp(SCRIPT_END_PLACEHOLDER, 'g'), '</script>')

            const leadingWs = text.match(/^\n?(\s*)/)[1].length,
                leadingTabs = text.match(/^\n?(\t*)/)[1].length

            if (leadingTabs > 0) {
                text = text.replace(new RegExp('\\n?\\t{' + leadingTabs + '}(.*)', 'g'), function (m, p1) {
                    return '\n' + p1
                })
            } else if (leadingWs > 1) {
                text = text.replace(new RegExp('\\n? {' + leadingWs + '}(.*)', 'g'), function (m, p1) {
                    return '\n' + p1
                })
            }

            return text
        },

        /**
         * Given a markdown slide section element, this will
         * return all arguments that aren't related to markdown
         * parsing. Used to forward any other user-defined arguments
         * to the output markdown slide.
         */
        getForwardedAttributes: function (section) {
            const attributes = section.attributes
            const result = []

            for (let i = 0, len = attributes.length; i < len; i++) {
                const name = attributes[i].name,
                    value = attributes[i].value

                // disregard attributes that are used for markdown loading/parsing
                if (/data\-(markdown|separator|vertical|notes)/gi.test(name)) continue

                if (value) {
                    result.push(name + '="' + value + '"')
                } else {
                    result.push(name)
                }
            }

            return result.join(' ')
        },

        /**
         * Inspects the given options and fills out default
         * values for what's not defined.
         */
        getSlidifyOptions: function (options) {
            const markdownConfig = deck?.getConfig?.().markdown

            options = options || {}
            options.separator = options.separator || markdownConfig?.separator || DEFAULT_SLIDE_SEPARATOR
            options.verticalSeparator =
                options.verticalSeparator || markdownConfig?.verticalSeparator || DEFAULT_VERTICAL_SEPARATOR
            options.notesSeparator = options.notesSeparator || markdownConfig?.notesSeparator || DEFAULT_NOTES_SEPARATOR
            options.separateByHeading = options.separateByHeading || markdownConfig?.separateByHeading || false
            options.attributes = options.attributes || ''

            return options
        },

        /**
         * Helper function for constructing a markdown slide.
         */
        createMarkdownSlide: function (content, options) {
            options = this.getSlidifyOptions(options)

            const notesMatch = content.split(new RegExp(options.notesSeparator, 'mgi'))

            if (notesMatch.length === 2) {
                content = notesMatch[0] + '<aside class="notes">' + marked(notesMatch[1].trim()) + '</aside>'
            }

            // prevent script end tags in the content from interfering
            // with parsing
            content = content.replace(/<\/script>/g, SCRIPT_END_PLACEHOLDER)

            // render the template with the content only if there is metadata
            if (options.metadata) {
                content = this.renderTemplate(content, options)
            }

            return '<script type="text/template">' + content + '</script>'
        },

        /**
         * Parses a data string into multiple slides based
         * on the passed in separator arguments.
         */
        slidify: function (markdown, options) {
            options = this.getSlidifyOptions(options)

            // add slide separator in the case heading indicates the new slide
            if (options.separateByHeading) {
                if (options.hasDataSeparator) {
                    return (
                        '<section ' +
                        options.attributes +
                        ' data-markdown>' +
                        'Please do not specify "data-markdown" when "data-separator-by-heading" is used.' +
                        '</section>'
                    )
                }
                options['slideSeparator'] = '---'
                markdown = this.addSlideSeparator(markdown, options)
            }

            const separatorRegex = new RegExp(
                    options.separator + (options.verticalSeparator ? '|' + options.verticalSeparator : ''),
                    'mg'
                ),
                horizontalSeparatorRegex = new RegExp(options.separator)

            let matches,
                lastIndex = 0,
                isHorizontal,
                wasHorizontal = true,
                content
            const sectionStack = []

            // separates default metadata from the markdown file
            ;[markdown, options] = this.parseFrontMatter(markdown, options)

            // iterate until all blocks between separators are stacked up
            while ((matches = separatorRegex.exec(markdown))) {
                // determine direction (horizontal by default)
                isHorizontal = horizontalSeparatorRegex.test(matches[0])

                if (!isHorizontal && wasHorizontal) {
                    // create vertical stack
                    sectionStack.push([])
                }

                // pluck slide content from markdown input
                content = markdown.substring(lastIndex, matches.index)

                if (isHorizontal && wasHorizontal) {
                    // add to horizontal stack
                    sectionStack.push(content)
                } else {
                    // add to vertical stack
                    sectionStack[sectionStack.length - 1].push(content)
                }

                lastIndex = separatorRegex.lastIndex
                wasHorizontal = isHorizontal
            }

            // add the remaining slide
            ;(wasHorizontal ? sectionStack : sectionStack[sectionStack.length - 1]).push(markdown.substring(lastIndex))

            let markdownSections = ''

            // flatten the hierarchical stack, and insert <section data-markdown> tags
            for (let i = 0, len = sectionStack.length; i < len; i++) {
                // slideOptions is created to avoid mutating the original options object with default metadata
                let slideOptions = { ...options }

                // vertical
                if (sectionStack[i] instanceof Array) {
                    markdownSections += '<section ' + slideOptions.attributes + '>'

                    sectionStack[i].forEach((child) => {
                        ;[content, slideOptions] = this.separateInlineMetadataAndMarkdown(child, slideOptions)
                        markdownSections +=
                            '<section ' +
                            slideOptions.attributes +
                            ' data-markdown>' +
                            this.createMarkdownSlide(content, slideOptions) +
                            '</section>'
                    })

                    markdownSections += '</section>'
                } else {
                    ;[content, slideOptions] = this.separateInlineMetadataAndMarkdown(sectionStack[i], slideOptions)
                    markdownSections +=
                        '<section ' +
                        slideOptions.attributes +
                        ' data-markdown>' +
                        this.createMarkdownSlide(content, slideOptions) +
                        '</section>'
                }
            }

            return markdownSections
        },

        /**
         * Parses any current data-markdown slides, splits
         * multi-slide markdown into separate sections and
         * handles loading of external markdown.
         */
        processSlides: function (scope) {
            const self = this

            return new Promise(function (resolve) {
                const externalPromises = []

                ;[].slice
                    .call(scope.querySelectorAll('section[data-markdown]:not([data-markdown-parsed])'))
                    .forEach((section) => {
                        if (section.getAttribute('data-markdown').length) {
                            externalPromises.push(
                                self.loadExternalMarkdown(section).then(
                                    // Finished loading external file
                                    function (xhr) {
                                        section.outerHTML = self.slidify(xhr.responseText, {
                                            separator: section.getAttribute('data-separator'),
                                            verticalSeparator: section.getAttribute('data-separator-vertical'),
                                            notesSeparator: section.getAttribute('data-separator-notes'),
                                            separateByHeading: section.hasAttribute('data-separator-by-heading'),
                                            hasDataSeparator: section.hasAttribute('data-separator'),
                                            attributes: self.getForwardedAttributes(section),
                                        })
                                    },

                                    // Failed to load markdown
                                    function (xhr, url) {
                                        section.outerHTML =
                                            '<section data-state="alert">' +
                                            'ERROR: The attempt to fetch ' +
                                            url +
                                            ' failed with HTTP status ' +
                                            xhr.status +
                                            '.' +
                                            "Check your browser's JavaScript console for more details." +
                                            '<p>Remember that you need to serve the presentation HTML from a HTTP server.</p>' +
                                            '</section>'
                                    }
                                )
                            )
                        } else {
                            section.outerHTML = self.slidify(self.getMarkdownFromSlide(section), {
                                separator: section.getAttribute('data-separator'),
                                verticalSeparator: section.getAttribute('data-separator-vertical'),
                                notesSeparator: section.getAttribute('data-separator-notes'),
                                separateByHeading: section.hasAttribute('data-separator-by-heading'),
                                hasDataSeparator: section.hasAttribute('data-separator'),
                                attributes: self.getForwardedAttributes(section),
                            })
                        }
                    })

                Promise.all(externalPromises).then(resolve)
            })
        },

        loadExternalMarkdown: function (section) {
            return new Promise(function (resolve, reject) {
                const xhr = new XMLHttpRequest(),
                    url = section.getAttribute('data-markdown')

                const datacharset = section.getAttribute('data-charset')

                // see https://developer.mozilla.org/en-US/docs/Web/API/element.getAttribute#Notes
                if (datacharset !== null && datacharset !== '') {
                    xhr.overrideMimeType('text/html; charset=' + datacharset)
                }

                xhr.onreadystatechange = function (section, xhr) {
                    if (xhr.readyState === 4) {
                        // file protocol yields status code 0 (useful for local debug, mobile applications etc.)
                        if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) {
                            resolve(xhr, url)
                        } else {
                            reject(xhr, url)
                        }
                    }
                }.bind(this, section, xhr)

                xhr.open('GET', url, true)

                try {
                    xhr.send()
                } catch (e) {
                    console.warn(
                        'Failed to get the Markdown file ' +
                            url +
                            '. Make sure that the presentation and the file are served by a HTTP server and the file can be found there. ' +
                            e
                    )
                    resolve(xhr, url)
                }
            })
        },

        /**
         * Check if a node value has the attributes pattern.
         * If yes, extract it and add that value as one or several attributes
         * to the target element.
         *
         * You need Cache Killer on Chrome to see the effect on any FOM transformation
         * directly on refresh (F5)
         * http://stackoverflow.com/questions/5690269/disabling-chrome-cache-for-website-development/7000899#answer-11786277
         */
        addAttributeInElement: function (node, elementTarget, separator) {
            const markdownClassesInElementsRegex = new RegExp(separator, 'mg')
            const markdownClassRegex = new RegExp('([^"= ]+?)="([^"]+?)"|(data-[^"= ]+?)(?=[" ])', 'mg')
            let nodeValue = node.nodeValue
            let matches, matchesClass
            if ((matches = markdownClassesInElementsRegex.exec(nodeValue))) {
                const classes = matches[1]
                nodeValue =
                    nodeValue.substring(0, matches.index) +
                    nodeValue.substring(markdownClassesInElementsRegex.lastIndex)
                node.nodeValue = nodeValue
                while ((matchesClass = markdownClassRegex.exec(classes))) {
                    if (matchesClass[2]) {
                        elementTarget.setAttribute(matchesClass[1], matchesClass[2])
                    } else {
                        elementTarget.setAttribute(matchesClass[3], '')
                    }
                }
                return true
            }
            return false
        },

        /**
         * Add attributes to the parent element of a text node,
         * or the element of an attribute node.
         */
        addAttributes: function (
            section,
            element,
            previousElement,
            separatorElementAttributes,
            separatorSectionAttributes
        ) {
            if (element !== null && element.childNodes !== undefined && element.childNodes.length > 0) {
                let previousParentElement = element
                for (let i = 0; i < element.childNodes.length; i++) {
                    const childElement = element.childNodes[i]
                    if (i > 0) {
                        let j = i - 1
                        while (j >= 0) {
                            const aPreviousChildElement = element.childNodes[j]
                            if (
                                typeof aPreviousChildElement.setAttribute === 'function' &&
                                aPreviousChildElement.tagName !== 'BR'
                            ) {
                                previousParentElement = aPreviousChildElement
                                break
                            }
                            j = j - 1
                        }
                    }
                    let parentSection = section
                    if (childElement.nodeName === 'section') {
                        parentSection = childElement
                        previousParentElement = childElement
                    }
                    if (
                        typeof childElement.setAttribute === 'function' ||
                        childElement.nodeType === Node.COMMENT_NODE
                    ) {
                        this.addAttributes(
                            parentSection,
                            childElement,
                            previousParentElement,
                            separatorElementAttributes,
                            separatorSectionAttributes
                        )
                    }
                }
            }

            if (element.nodeType === Node.COMMENT_NODE) {
                if (this.addAttributeInElement(element, previousElement, separatorElementAttributes) === false) {
                    this.addAttributeInElement(element, section, separatorSectionAttributes)
                }
            }
        },

        /**
         * Converts any current data-markdown slides in the
         * DOM to HTML.
         */
        convertSlides: function () {
            const sections = deck.getRevealElement().querySelectorAll('[data-markdown]:not([data-markdown-parsed])')

            ;[].slice.call(sections).forEach((section) => {
                section.setAttribute('data-markdown-parsed', true)

                const notes = section.querySelector('aside.notes')
                const markdown = this.getMarkdownFromSlide(section)

                section.innerHTML = marked(markdown)
                this.addAttributes(
                    section,
                    section,
                    null,
                    section.getAttribute('data-element-attributes') ||
                        section.parentNode.getAttribute('data-element-attributes') ||
                        DEFAULT_ELEMENT_ATTRIBUTES_SEPARATOR,
                    section.getAttribute('data-attributes') ||
                        section.parentNode.getAttribute('data-attributes') ||
                        DEFAULT_SLIDE_ATTRIBUTES_SEPARATOR
                )

                // If there were notes, we need to re-add them after
                // having overwritten the section's HTML
                if (notes) {
                    section.appendChild(notes)
                }
            })

            return Promise.resolve()
        },

        escapeForHTML: function (input) {
            return input.replace(/([&<>'"])/g, (char) => HTML_ESCAPE_MAP[char])
        },

        /**
         * Parse the front matter from the Markdown document
         *
         * Returns updated options with the default metadata
         * and updated content without the front matter
         */
        parseFrontMatter: function (content, options) {
            options = this.getSlidifyOptions(options)
            if (/^(\n|\s)/.test(content)) {
                content = content.replace(/^(\n|\s)+/, '')
            }

            const parsedFrontMatter = fm(content)

            content = parsedFrontMatter.body
            if (parsedFrontMatter.frontmatter) {
                options.metadata = yaml.load(parsedFrontMatter.frontmatter)
            }
            return [content, options]
        },

        /**
         * Add slide separator in case where the heading indicates the start of new slide
         *
         * Returns the updated markdown file with added slide separator above every slide headings
         */
        addSlideSeparator: function (markdown, options) {
            const lines = markdown.split('\n')
            const result = []
            let firstHeadingProcessingDone = false

            lines.forEach((line, index) => {
                if (line.match(/^#{1,6}\s+/)) {
                    if (!firstHeadingProcessingDone) {
                        firstHeadingProcessingDone = true
                    } else {
                        const previousLine = lines[index - 1] || ''
                        if (previousLine !== options.slideSeparator) {
                            result.push(options.slideSeparator)
                        }
                    }
                }
                result.push(line)
            })
            markdown = result.join('\n')
            return markdown
        },

        /**
         * Separates the inline metadata and content for slide having inline metadata in yaml block as
         *
         * ```yaml
         * metadata_key1: metadata_value1
         * metadata_key2: metadata_value2
         * ```
         */
        extractYAMLMetadata: function (markdown, options) {
            const markdownParts = yamlRegex.exec(markdown)
            yamlRegex.lastIndex = 0
            if (markdownParts && markdownParts[2]) {
                const metadata = markdownParts[2]
                markdown = markdownParts[3] || ''

                try {
                    const metadataYAML = yaml.load(metadata)
                    if (metadataYAML === undefined) {
                        throw new Error('The inline metadata is not valid.')
                    }
                    options.metadata = { ...options.metadata, ...metadataYAML }
                    options.attributes = 'class=' + (options.metadata.slide || '')
                } catch (error) {
                    console.error(error)
                    markdown = error.message
                }
            }
            return [markdown, options]
        },

        /**
         * Separates the inline metadata and content for slides having metadata as
         *
         * ::metadata_key1:metadata_value1 ::metadata_key2:metadata_value2
         */
        extractInlineMetadata: function (markdown, options) {
            const inlineMetadata = {}
            const matches = markdown.match(headingWithMetadataRegex)

            if (matches && matches[0]) {
                const metadataMatches = matches[0].match(metadataRegex)
                if (metadataMatches) {
                    metadataMatches.forEach((metadataMatch) => {
                        const [key, value] = metadataMatch.replace('::', '').split(':')
                        inlineMetadata[key.trim()] = value.trim()
                        const metadataPattern = new RegExp(`::\\b${key.trim()}\\b:\\s*${value.trim()}`)
                        markdown = markdown.replace(metadataPattern, '')
                    })
                }
            }

            options.metadata = { ...options.metadata, ...inlineMetadata }
            options.attributes = 'class=' + (options.metadata.slide || '')
            return [markdown, options]
        },

        /**
         * Separates the inline metadata and content for each slide
         *
         * Returns updated options with the inline metadata and
         * updated markdown without the inline metadata for each slide
         */
        separateInlineMetadataAndMarkdown: function (markdown, options) {
            const yamlMetadata = yamlRegex.test(markdown)
            const newMetadata = headingWithMetadataRegex.test(markdown)
            yamlRegex.lastIndex = 0

            if (options.separateByHeading) {
                ;[markdown, options] = this.extractInlineMetadata(markdown, options)
            } else {
                switch (true) {
                    case newMetadata:
                        ;[markdown, options] = this.extractInlineMetadata(markdown, options)
                        break
                    case yamlMetadata:
                        ;[markdown, options] = this.extractYAMLMetadata(markdown, options)
                        break
                    default:
                        if (options.metadata) {
                            options.attributes = 'class=' + (options.metadata.slide || '')
                        }
                        break
                }
            }

            return [markdown, options]
        },

        /**
         * Renders the template for each slide
         *
         * Returns the rendered template with the content
         */
        renderTemplate: function (content, options) {
            try {
                const titleRegex = /^#+\r*(.*?)\r*$/m
                const matches = content.match(titleRegex)
                let title
                if (matches) {
                    title = matches[1].trim()
                }
                let slideContent = content.replace(titleRegex, '').trim()
                slideContent = this.renderMarkdownAlerts(slideContent)

                options = this.getSlidifyOptions(options)
                const url = new URL(import.meta.url)
                const templatePath = `${url.origin}/templates/${options.metadata.slide}-template.html`
                const xhr = new XMLHttpRequest()
                xhr.open('GET', templatePath, false)
                xhr.send()
                const tempDiv = document.createElement('div')
                if (xhr.status === 200) {
                    tempDiv.innerHTML = Mustache.render(xhr.responseText, {
                        title: title,
                        content: slideContent,
                        metadata: options.metadata,
                    })
                } else {
                    tempDiv.innerHTML = `Template for slide "${options.metadata.slide}" not found.`
                    console.error(`Failed to fetch template. Status: ${xhr.status}`)
                }
                return tempDiv.textContent
            } catch (error) {
                console.error('Error:', error)
                throw error
            }
        },

        /**
         * Splits the slide content to different blocks
         * So that every blocks can be rendered separately
         */
        splitSlideContentIntoBlocks: function (content) {
            const lines = content.split(/\r?\n/)
            const blocks = []
            let currentBlock = []
            let inAlertBlock = false

            lines.forEach((line) => {
                const trimmedLine = line.trim()

                // if empty line, reset
                if (!trimmedLine) {
                    if (currentBlock.length > 0) {
                        blocks.push(currentBlock.join('\n'))
                        currentBlock = []
                        inAlertBlock = false
                    }
                    return
                }

                // check for start of alert block
                if (/^>+\s*\[!/.test(trimmedLine)) {
                    if (currentBlock.length > 0) {
                        blocks.push(currentBlock.join('\n'))
                    }
                    currentBlock = [line]
                    inAlertBlock = true
                }
                // if line starts with '>' or is next line of the same block
                else if (trimmedLine.startsWith('>')) {
                    currentBlock.push(line)
                    inAlertBlock = true
                }
                // if line is a normal line and is part of the same block
                else if (inAlertBlock && trimmedLine) {
                    currentBlock.push(line)
                }
                // for normal text block
                else {
                    if (currentBlock.length > 0) {
                        blocks.push(currentBlock.join('\n'))
                        currentBlock = []
                        inAlertBlock = false
                    }
                    blocks.push(line)
                }
            })

            if (currentBlock.length > 0) {
                blocks.push(currentBlock.join('\n'))
            }

            return blocks
        },

        /**
         * Returns the nested blockquote depending upon the number of '>' in the alert block
         */
        createNestedBlockquote: function (count, content) {
            if (count <= 0) return content
            return `<blockquote>${this.createNestedBlockquote(count - 1, content)}</blockquote>`
        },

        /**
         * Returns the rendered blockquote
         */
        renderBlockquote: function (alertMessageArray) {
            const alertDiv = document.createElement('div')
            let groupedContent = []
            let currentCount = 0

            const count = alertMessageArray[0].match(/^(>+)/)[1].length
            for (const message of alertMessageArray) {
                const text = message.replace(/^>+\s*/, '').trim()

                // get the count of '>' at the start and create the blockquote
                // create a nested blockqoute depending upon the count
                // for example, if count = 2 then blockquotes = '<blockquote><blockquote>content</blockquote></blockquote>'
                if (count !== currentCount && groupedContent.length > 0) {
                    const blockContent = `<p>${groupedContent.join('<br>')}</p>`
                    const blockquotes = this.createNestedBlockquote(currentCount, blockContent)
                    alertDiv.insertAdjacentHTML('beforeend', blockquotes)
                    groupedContent = []
                }

                currentCount = count
                groupedContent.push(text)
            }
            if (groupedContent.length > 0) {
                const blockContent = `<p>${groupedContent.join('<br>')}</p>`
                const blockquotes = this.createNestedBlockquote(currentCount, blockContent)
                alertDiv.insertAdjacentHTML('beforeend', blockquotes)
            }
            return alertDiv.innerHTML
        },

        /**
         * Returns the markdown alerts
         */
        renderMarkdownAlerts: function (content) {
            const alertsMatch = content.match(alertRegex)
            if (!alertsMatch) {
                return content
            }
            // separate different alerts or other contents into different blocks and render them separately
            const blocks = this.splitSlideContentIntoBlocks(content)

            const alertsContainer = document.createElement('div')

            for (const block of blocks) {
                // Check if the block has following pattern
                // > [!CAUTION]
                // > Advises about risks or negative outcomes of certain actions.
                if (block.match(alertBlockRegex)) {
                    const alert = alertBlockRegex.exec(block)
                    alertBlockRegex.lastIndex = 0

                    let alertContentArray = alert.input.split('\n')

                    const match = alertContentArray[0].match(alertTypeRegex)
                    const type = match[0].match(regexToGetAlertType)[1].toLowerCase()
                    const count = alertContentArray[0].match(/^(>+)/)[1].length

                    const alertDiv = document.createElement('div')
                    // check if the first line of the block has single '>'
                    // if true then render the block as valid alert
                    // else render the block as block quote
                    if (type in alertIcons && count === 1) {
                        alertDiv.classList.add('alert', type)
                        alertContentArray = alertContentArray.slice(1)

                        const alertTitle = document.createElement('div')
                        alertTitle.classList.add('alert-title')
                        alertTitle.innerHTML = alertIcons[type]

                        const textNode = document.createTextNode(' ' + type.charAt(0).toUpperCase() + type.slice(1))
                        alertTitle.appendChild(textNode)
                        document.body.appendChild(alertTitle)
                        alertDiv.appendChild(alertTitle)
                    } else {
                        alertDiv.classList.add('alert')
                    }
                    for (const message of alertContentArray) {
                        const match = alertContentArray[0].match(/^(>+)/)
                        const count = match === null ? 1 : match[1].length
                        const blockquotes = this.createNestedBlockquote(count, message.replace(/^>+\s*/, '').trim())
                        alertDiv.insertAdjacentHTML('beforeend', blockquotes)
                    }
                    this.styleBlockquotes(alertDiv)
                    alertsContainer.appendChild(alertDiv)
                }
                // for invalid alert blocks render the block as block quote
                else if (block.match(alertTypeRegex) || block.match(alertMessageRegex)) {
                    const alertMessageArray = block.split('\n')

                    const alertDiv = document.createElement('div')
                    alertDiv.classList.add('alert')

                    alertDiv.innerHTML = this.renderBlockquote(alertMessageArray)

                    this.styleBlockquotes(alertDiv)
                    alertsContainer.appendChild(alertDiv)
                } else {
                    const plainContent = document.createElement('p')
                    plainContent.textContent = block
                    alertsContainer.appendChild(plainContent)
                }
            }
            return alertsContainer.innerHTML
        },

        /**
         * Adjust styling if there are nested blockquote
         */
        styleBlockquotes: function (parent) {
            const blockquotes = parent.querySelectorAll('blockquote')

            blockquotes.forEach((blockquote) => {
                if (blockquote.querySelector('blockquote')) {
                    parent.style.setProperty('--padding-top', '0px')
                    parent.style.setProperty('--padding-bottom', '0px')
                    const parentBlockquote = blockquote.closest('blockquote')

                    if (parentBlockquote) {
                        parentBlockquote.style.paddingTop = '0'
                        parentBlockquote.style.paddingBottom = '0'
                    }

                    blockquote.style.border = '0 solid'
                    blockquote.style.borderLeftWidth = '6px'
                }
            })
        },
    }
}

export default plugin
