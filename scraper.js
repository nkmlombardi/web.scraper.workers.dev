const cleanText = (s) => s.trim().replace(/\s\s+/g, ' ')

class Scraper {
    constructor() {
        this.rewriter = new HTMLRewriter()
        return this
    }

    async fetch(url) {
        this.url = url
        this.response = await fetch(url)

        const server = this.response.headers.get('server')

        const isThisWorkerErrorNotErrorWithinScrapedSite =
            [530, 503, 502, 403, 400].includes(this.response.status) &&
            (server === 'cloudflare' || !server) /* Workers preview editor */

        if (isThisWorkerErrorNotErrorWithinScrapedSite) {
            throw new Error(`Status ${this.response.status} requesting ${url}`)
        }

        return this
    }

    querySelector(selector) {
        this.selector = selector
        return this
    }

    async getText({ spaced }) {
        const matches = {}
        const selectors = new Set(this.selector.split(',').map((s) => s.trim()))

        selectors.forEach((selector) => {
            matches[selector] = []

            let nextText = ''

            this.rewriter.on(selector, {
                element(element) {
                    matches[selector].push(true)
                    nextText = ''
                },

                text(text) {
                    nextText += text.text

                    if (text.lastInTextNode) {
                        if (spaced) nextText += ' '
                        matches[selector].push(nextText)
                        nextText = ''
                    }
                },
            })
        })

        const transformed = this.rewriter.transform(this.response)

        await transformed.arrayBuffer()

        selectors.forEach((selector) => {
            const nodeCompleteTexts = []

            let nextText = ''

            matches[selector].forEach((text) => {
                if (text === true) {
                    if (nextText.trim() !== '') {
                        nodeCompleteTexts.push(cleanText(nextText))
                        nextText = ''
                    }
                } else {
                    nextText += text
                }
            })

            const lastText = cleanText(nextText)
            if (lastText !== '') nodeCompleteTexts.push(lastText)
            matches[selector] = nodeCompleteTexts
        })

        return selectors.length === 1 ? matches[selectors[0]] : matches
    }

    async getAttributes(attributes) {
        const matches = {}
        const selectors = new Set(this.selector.split(',').map((s) => s.trim()))

        class AttributeScraper {
            constructor(attrs) {
                this.attrs = Array.isArray(attrs) ? attrs : [attrs]
                this.results = []
            }

            element(element) {
                const attrValues = {}
                this.attrs.forEach((attr) => {
                    attrValues[attr] = element.getAttribute(attr)
                })
                this.results.push(attrValues)
            }
        }

        selectors.forEach((selector) => {
            const scraper = new AttributeScraper(attributes)
            this.rewriter.on(selector, scraper)
            matches[selector] = scraper
        })

        await this.rewriter.transform(this.response).arrayBuffer()

        selectors.forEach((selector) => {
            matches[selector] = matches[selector].results
        })

        return selectors.length === 1 ? matches[selectors[0]] : matches
    }
}

export default Scraper
