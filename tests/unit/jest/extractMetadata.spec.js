import fs from 'fs'
import plugin from '../../../plugin/awesoMD/plugin'

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
