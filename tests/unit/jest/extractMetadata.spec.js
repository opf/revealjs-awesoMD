import fs from 'fs'
import plugin from '../../../plugin/awesoMD/plugin'
const beautify = require('js-beautify').html

const mdPlugin = plugin()

afterEach(() => {
    jest.restoreAllMocks()
})

describe('separateInlineMetadataAndMarkdown', () => {
    let slideOptions = {
        metadata: {
            description: 'some description',
            footer: 'footer content',
            slide: 'title-content',
            presenter: 'presenter name',
        },
    }

    it.each([
        [
            [
                '```yaml\n' + 'slide: cover\n' + 'toc: false\n' + '```\n' + '# Cover Slide',
                '```yaml\n' + 'slide: section\n' + '```\n' + '# Section Slide',
                '# Title Content Slide\n' + 'some content',
            ],
            [
                [
                    {
                        description: 'some description',
                        footer: 'footer content',
                        slide: 'cover',
                        presenter: 'presenter name',
                        toc: false,
                    },
                    '# Cover Slide',
                ],
                [
                    {
                        description: 'some description',
                        footer: 'footer content',
                        slide: 'section',
                        presenter: 'presenter name',
                    },
                    '# Section Slide',
                ],
                [
                    {
                        description: 'some description',
                        footer: 'footer content',
                        slide: 'title-content',
                        presenter: 'presenter name',
                    },
                    '# Title Content Slide\nsome content',
                ],
            ],
        ],
        [
            [
                '# Cover Slide ::slide:cover ::toc:false',
                '# Section Slide ::slide:section',
                '# Title Content Slide\nsome content',
                '# Title with colon slide:notavalue ::slide:cover ::toc:false',
                '# Cover Slide ::slide:cover ::toc:false ::toc:true',
            ],
            [
                [
                    {
                        description: 'some description',
                        footer: 'footer content',
                        slide: 'cover',
                        presenter: 'presenter name',
                        toc: 'false',
                    },
                    '# Cover Slide',
                ],
                [
                    {
                        description: 'some description',
                        footer: 'footer content',
                        slide: 'section',
                        presenter: 'presenter name',
                    },
                    '# Section Slide',
                ],
                [
                    {
                        description: 'some description',
                        footer: 'footer content',
                        slide: 'title-content',
                        presenter: 'presenter name',
                    },
                    '# Title Content Slide\nsome content',
                ],
                [
                    {
                        description: 'some description',
                        footer: 'footer content',
                        slide: 'cover',
                        presenter: 'presenter name',
                        toc: 'false',
                    },
                    '# Title with colon slide:notavalue',
                ],
                [
                    {
                        description: 'some description',
                        footer: 'footer content',
                        slide: 'cover',
                        presenter: 'presenter name',
                        toc: 'true',
                    },
                    '# Cover Slide',
                ],
            ],
        ],
    ])(
        'should separate and return expected metadata and markdown content',
        (slideContent, expectedSeparatedMetadataAndMarkdown) => {
            const spySeparateInlineMetadataAndMarkdown = jest.spyOn(mdPlugin, 'separateInlineMetadataAndMarkdown')
            slideContent.forEach((slide, index) => {
                const [content, options] = mdPlugin.separateInlineMetadataAndMarkdown(slide, { ...slideOptions })
                expect(options.metadata).toEqual(expectedSeparatedMetadataAndMarkdown[index][0])
                expect(content.trim()).toEqual(expectedSeparatedMetadataAndMarkdown[index][1])
            })

            expect(spySeparateInlineMetadataAndMarkdown).toHaveBeenCalledTimes(slideContent.length)
        }
    )

    it.each([true, false])(
        'should execute extractInlineMetadata when separator by heading is true',
        (separateByHeading) => {
            slideOptions = {
                ...slideOptions,
                separateByHeading: separateByHeading,
            }

            const metadataSlide = [
                '# Cover Slide ::slide:cover ::toc:false',
                '# Section Slide ::slide:section',
                '# Title Content Slide\nsome content',
            ]

            const expectedMetadataAndMarkdown = [
                [
                    {
                        description: 'some description',
                        footer: 'footer content',
                        slide: 'cover',
                        presenter: 'presenter name',
                        toc: 'false',
                    },
                    '# Cover Slide',
                ],
                [
                    {
                        description: 'some description',
                        footer: 'footer content',
                        slide: 'section',
                        presenter: 'presenter name',
                    },
                    '# Section Slide',
                ],
                [
                    {
                        description: 'some description',
                        footer: 'footer content',
                        slide: 'title-content',
                        presenter: 'presenter name',
                    },
                    '# Title Content Slide\nsome content',
                ],
            ]

            const spySeparateInlineMetadataAndMarkdown = jest.spyOn(mdPlugin, 'separateInlineMetadataAndMarkdown')
            const spyExtractInlineMetadata = jest.spyOn(mdPlugin, 'extractInlineMetadata')
            const spyExtractYAMLMetadata = jest.spyOn(mdPlugin, 'extractYAMLMetadata')
            metadataSlide.forEach((slide, index) => {
                const [content, options] = mdPlugin.separateInlineMetadataAndMarkdown(slide, { ...slideOptions })
                expect(options.metadata).toEqual(expectedMetadataAndMarkdown[index][0])
                expect(content.trim()).toEqual(expectedMetadataAndMarkdown[index][1])
            })

            expect(spySeparateInlineMetadataAndMarkdown).toHaveBeenCalledTimes(metadataSlide.length)

            if (separateByHeading) {
                expect(spyExtractInlineMetadata).toHaveBeenCalledTimes(metadataSlide.length)
            } else {
                expect(spyExtractYAMLMetadata).not.toHaveBeenCalled()
            }
        }
    )
})

describe('addSlideSeparator', () => {
    const options = {
        slideSeparator: '---',
    }
    const expectedMarkdownContent = `---
description: some description
footer: footer content
slide: title-content
presenter: presenter name
---
# Cover Slide ::slide:cover ::toc:false

---
# Section Slide ::slide:section

---
# Title Content Slide
some content
`

    it('should add slide separator', () => {
        const markdownContent = fs.readFileSync('tests/unit/testFiles/noSlideSeparator.md', 'utf-8')
        const updatedMarkdownContent = mdPlugin.addSlideSeparator(markdownContent, options)
        expect(updatedMarkdownContent).toEqual(expectedMarkdownContent)
    })
})

describe('slidify', () => {
    it('should return error message when data-separator is provided with data-separator-by-heading', () => {
        const options = {
            separateByHeading: true,
            hasDataSeparator: true,
        }
        const expectedMarkdownSection =
            '<section  data-markdown>' +
            'Please do not specify "data-markdown" when "data-separator-by-heading" is used.' +
            '</section>'

        const markdownContent = fs.readFileSync('tests/unit/testFiles/noSlideSeparator.md', 'utf-8')
        const returnedMarkdownSection = mdPlugin.slidify(markdownContent, { ...options })
        expect(returnedMarkdownSection).toEqual(expectedMarkdownSection)
    })
})

describe('parseFrontMatter', () => {
    const frontmatter = `---
description: some description
footer: footer content
slide: title-content
presenter: presenter name
---
`
    const expectedMarkdownContent = `# Cover Slide ::slide:cover ::toc:false

---
# Section Slide ::slide:section

---
# Title Content Slide
some content
`
    it.each([' ', '\n', '   ', '\n\n\n'])('new line and spaces should be removed', (noise) => {
        const returnedMarkdownSection = mdPlugin.parseFrontMatter(noise + frontmatter + expectedMarkdownContent, {})[0]
        expect(returnedMarkdownSection).toEqual(expectedMarkdownContent)
    })
})

describe('renderMarkdownAlerts', () => {
    const markdownAlerts = `> [!CAUTION]
> Advises about risks or negative outcomes of certain actions.

> [!CAUTION]
> Advises about risks or negative outcomes of certain actions.
> an other line

>    [!CAUTION]
> Advises about risks or negative outcomes of certain actions.

> [!something]
> Advises about risks or negative outcomes of certain actions.

> [!CAUTION]

> Advises about risks or negative outcomes of certain actions.

>> [!CAUTION]
>> Advises about risks or negative outcomes of certain actions.

> [!CAUTION] Advises about risks or negative outcomes of certain actions.

> [!CAUTION]
        > Advises about risks or negative outcomes of certain actions.`

    const expectedRenderedMarkdowAlerts = `<div class="alert caution">
    <div class="alert-title"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
            <path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path>
        </svg> Caution</div>
    <blockquote>Advises about risks or negative outcomes of certain actions.</blockquote>
</div>
<div class="alert caution">
    <div class="alert-title"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
            <path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path>
        </svg> Caution</div>
    <blockquote>Advises about risks or negative outcomes of certain actions.</blockquote>
    <blockquote>an other line</blockquote>
</div>
<div class="alert caution">
    <div class="alert-title"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
            <path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path>
        </svg> Caution</div>
    <blockquote>Advises about risks or negative outcomes of certain actions.</blockquote>
</div>
<div class="alert">
    <blockquote>[!something]</blockquote>
    <blockquote>Advises about risks or negative outcomes of certain actions.</blockquote>
</div>
<div class="alert">
    <blockquote>
        <p>[!CAUTION]</p>
    </blockquote>
</div>
<div class="alert">
    <blockquote>
        <p>Advises about risks or negative outcomes of certain actions.</p>
    </blockquote>
</div>
<div class="alert" style="--padding-top: 0px; --padding-bottom: 0px;">
    <blockquote style="padding-top: 0px; padding-bottom: 0px; border: 0px solid; border-left-width: 6px;">
        <blockquote>
            <p>[!CAUTION]<br>Advises about risks or negative outcomes of certain actions.</p>
        </blockquote>
    </blockquote>
</div>
<div class="alert">
    <blockquote>
        <p>[!CAUTION] Advises about risks or negative outcomes of certain actions.</p>
    </blockquote>
</div>
<div class="alert caution">
    <div class="alert-title"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
            <path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path>
        </svg> Caution</div>
    <blockquote>&gt; Advises about risks or negative outcomes of certain actions.</blockquote>
</div>`

    it('should render the markdown alerts', () => {
        const returnedRenderedMarkdownAlerts = mdPlugin.renderMarkdownAlerts(markdownAlerts)
        expect(beautify(returnedRenderedMarkdownAlerts)).toBe(beautify(expectedRenderedMarkdowAlerts))
    })
})
