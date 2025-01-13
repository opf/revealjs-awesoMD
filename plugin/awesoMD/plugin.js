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
                const titleRegex = /^#+\s*(.*?)\s*$/m
                const matches = content.match(titleRegex)
                let title
                if (matches) {
                    title = matches[1].trim()
                }
                const slideContent = content.replace(titleRegex, '')

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
    }
}

export default plugin
