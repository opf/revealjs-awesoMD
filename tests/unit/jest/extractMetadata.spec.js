import Plugin from '../../../plugin/awesoMD/plugin'

// eslint-disable-next-line new-cap
const plugin = Plugin()

describe('separateInlineMetadataAndMarkdown', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

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
            const slideOptions = {
                metadata: {
                    description: 'some description',
                    footer: 'footer content',
                    slide: 'title-content',
                    presenter: 'presenter name',
                },
            }
            const spySeparateInlineMetadataAndMarkdown = jest.spyOn(plugin, 'separateInlineMetadataAndMarkdown')
            slideContent.forEach((slide, index) => {
                const [content, options] = spySeparateInlineMetadataAndMarkdown(slide, { ...slideOptions })
                expect(options.metadata).toEqual(expectedSeparatedMetadataAndMarkdown[index][0])
                expect(content.trim()).toEqual(expectedSeparatedMetadataAndMarkdown[index][1])
            })

            expect(spySeparateInlineMetadataAndMarkdown).toHaveBeenCalledTimes(slideContent.length)
        }
    )
})
