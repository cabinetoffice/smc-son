class DataUtils {
    constructor(type) {
        this.type = type || 'json'
        this.data = {
            'headers': [],
            'data': [],
            'type': this.type,
            'tag': '',
            'sort': -1,
            'sortOrder': 'asc',
            'filters': [],
            'page': -1,
            'pageSize': -1
        }
    }

    _init() {
        //
    }

    async loadData(data) {
        if (Array.isArray(data)) {
            this.data.headers = this.headersFromJSON(data)
            this.data.data = data
            return this.data.data
        } else if (typeof data === 'object' && data !== null) {
            this.data.headers = this.headersFromJSON(data.data || data)
            this.data.data = data.data || data
            return this.data.data
        } else if (this.isCSV(data)) {
            return this.loadDataFromString(data)
        } else if (this.isJSON(data)) {
            return this.loadDataFromString(data)
        } else if (this.isURL(data)) {
            return this.loadDataFromURL(data)
        } else if (this.isHTMLNode(data)) {
            return this.loadDataFromElement(data, true)
        }
    }

    async loadDataFromElement(el, hasHeader=true) {
        const table = document.getElementById(el)
        let headers = []
        let data = []

        function getAttributes(node) {
            let attributes = {}
            if (node.nodeName.toLowerCase() == 'td') attributes['title'] = node.innerText
            for (let i = 0; i < node.attributes.length; i++) {
                attributes[node.attributes[i].nodeName] = node.attributes[i].nodeValue
            }
            return attributes
        }

        const rows = table.tagName == 'TABLE' ? table.rows : table.children
        for (let i = 0; i < rows.length; i++) {
            if (i == 0) {
                for (let j = 0; j < rows[i].children.length; j++) {
                    headers.push(rows[i].children[j].innerText)
                }
            }

            if (!(i >= hasHeader ? 0 : -1)) {
                let row = this.type == 'json' ? {} : []
                const attributes = []
                attributes.push(getAttributes(rows[i]))
                for (let j = 0; j < rows[i].children.length; j++) {
                    if (this.type == 'json') {
                        row[headers[j]] = rows[i].children[j].innerHTML
                    } else {
                        row.push(rows[i].children[j].innerHTML)
                    }
                    attributes.push(getAttributes(rows[i].children[j]))
                }
                row['_attributes'] = attributes
                data.push(row)
            }
        }

        this.data.headers = headers
        this.data.data = data
        this.data.tag = table.tagName
        return this.data
    }

    async loadDataFromString(str) {
        let headers = []
        let data = []

        if (this.isCSV(str)) {
            if (this.type == 'json') {
                const result = this.csv2json(str)
                headers = result.headers
                data = result.data
            } else {
                headers = this.headersFromCSV(str)
                data = str
            }
        } else if (this.isJSON(str)) {
            if (this.type == 'json') {
                headers = this.headersFromJSON(str)
                data = JSON.parse(str)
            } else {
                const result = this.json2csv(str)
                headers = result.headers
                data = result.data
            }
        }

        this.data.headers = headers
        this.data.data = data
        return this.data
    }

    async loadDataFromURL(url) {
        return fetch(url)
            .then(response => response.text())
            .then(data => {
                return this.loadDataFromString(data)
            })
    }

    isCSV(data) {
        function determineMost(data, items) {
            let ignoreString = false
            let itemCount = {}
            let maxValue = 0
            let maxChar
            let currValue
            items.forEach(function (item) {
                itemCount[item] = 0
            })
            for (let i = 0; i < data.length; i++) {
                if (data[i] === '"') ignoreString = !ignoreString
                else if (!ignoreString && data[i] in itemCount) {
                    currValue = ++itemCount[data[i]]
                    if (currValue > maxValue) {
                        maxValue = currValue
                        maxChar = data[i]
                    }
                }
            }
            return maxChar
        }

        //if (Buffer.isBuffer(data)) data = data + ''
        const delimiters = [',', ';', '\t', '|']
        const newlines = ['\n', '\r']
        const lines = data.split(/[\n\r]+/g)
        const delimiter = determineMost(lines[0], delimiters)
        const newline = determineMost(data, newlines)

        if (delimiter) {
            return {
                delimiter: delimiter,
                newline: newline
            }
        }
        return false
    }

    isJSON(data) {
        try {
            JSON.parse(data)
        } catch (e) {
            return false
        }
        return true
    }

    isURL(data) {
        const pattern = new RegExp('^(https?:\\/\\/)?' +             // protocol
            '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' +     // domain name
            '((\\d{1,3}\\.){3}\\d{1,3}))' +                          // OR ip (v4) address
            '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' +                      // port and path
            '(\\?[;&a-z\\d%_.~+=-]*)?' +                             // query string
            '(\\#[-a-z\\d_]*)?$','i')                                // fragment locator
        return !!pattern.test(data.replace(/\/localhost/, '/127.0.0.1'))
    }

    isHTML(data) {
        const html = new DOMParser().parseFromString(data, 'text/html')
        return Array.from(html.body.childNodes).some(node => node.nodeType === 1)
    }

    isHTMLNode(data) {
        return !!document.getElementById(data)
    }

    csv2json(data) {
        const csvFormat = this.isCSV(data)
        if (!csvFormat) return data

        const rows = data.split(csvFormat.newline)
        const result = []
        const headers = this.substituteCommas(rows[0]).split(csvFormat.delimiter)
        for (let i = 1; i < rows.length; i++) {
            const row = {}
            const currentline = this.substituteCommas(rows[i]).split(csvFormat.delimiter)
            for (let j = 0; j < headers.length; j++) {
                let str = currentline[j] ? currentline[j].replace(/###/g, csvFormat.delimiter) : ''
                if (str.substr(0, 1) == '"' && str.substr(-1) == '"') str = str.substr(1, str.length - 2)
                row[headers[j].replace(/###/g, csvFormat.delimiter)] = str.trim()
            }          
            result.push(row)
        }

        return {
            'headers': headers,
            'data': result
        }
    }

    json2csv(data) {
        if (!this.isJSON(data)) return data

        const rows = JSON.parse(data)
        if (!Array.isArray(rows)) rows = [rows]
        const result = ''
        const headers = this.headersFromJSON(data)
                            .map(x => x.indexOf(',') > -1 && x.substr(0, 1) != '"' ? `"${x}"` : x)
                            .join(',')

        for (let i = 1; i < rows.length; i++) {
            let row = ''
            for (let j = 0; j < headers.length; j++) {
                str = rows[i][headers[j]]
                row += (row == '' ? '' : ',') + this.quoteCommas(str)
            }
            result += `\n${row}`
        }

        return {
            'headers': headers,
            'data': result
        }
    }

    headersFromCSV(data) {
        const csvFormat = this.isCSV(data)
        if (!csvFormat) return []

        const rows = data.split(csvFormat.newline)
        const headers = this.substituteCommas(rows[0]).split(csvFormat.delimiter)
                            .map(x => x.replace(/###/g, csvFormat.delimiter))
                            .map(x => x.substr(0, 1) == '"' && x.substr(-1) == '"' ? x.substr(1, x.length - 2) : x)

        return headers
    }

    headersFromJSON(data) {
        if (!this.isJSON(data)) return []

        data = JSON.parse(data)
        let rows = data.data || data
        if (!Array.isArray(rows)) rows = [rows]
        const headers = []
        for (const key in rows[0]) {
            if (rows[0].hasOwnProperty(key)) {
                headers.push(key)
            }
        }

        return headers
    }

    sortData(data, sort, sortOrder) {
        const headers = this.data['headers']

        if (sort > -1) {
            if (this.type == 'json') {
                if (sortOrder == 'asc') {
                    data.sort((a, b) => (a[headers[sort]] > b[headers[sort]]) ? 1 : ((b[headers[sort]] > a[headers[sort]]) ? -1 : 0))
                } else {
                    data.sort((a, b) => (b[headers[sort]] > a[headers[sort]]) ? 1 : ((a[headers[sort]] > b[headers[sort]]) ? -1 : 0))
                }
            } else {
                if (sortOrder == 'asc') {
                    data.sort((a, b) => (a[sort] > b[sort]) ? 1 : ((b[sort] > a[sort]) ? -1 : 0))
                } else {
                    data.sort((a, b) => (b[sort] > a[sort]) ? 1 : ((a[sort] > b[sort]) ? -1 : 0))
                }
            }
        }

        this.data['sort'] = sort
        this.data['sortOrder'] = sortOrder == 'asc' ? 'desc' : 'asc'
        return data
    }

    filterData(data, filters) {
        const headers = this.data['headers']

        let filteredColumns = []
        if (filters.length > 0) {
            let filtered = []
            for (let i = 0; i < data.length; i++) {
                let ok = ''
                for (let filter of filters) {
                    const columnNumber = headers.indexOf(filter['column'])
                    const column = this.type == 'json' ? filter['column'] : columnNumber

                    let include = false
                    if (filter['type'] == 'match') {
                        include = this.removeHTML(data[i][column]) == filter['value']
                    } else {
                        include = this.removeHTML(data[i][column]).toUpperCase().indexOf(filter['value'].toUpperCase()) > -1
                    }
                    if (include) {
                        filtered.push(data[i])
                        if (!filteredColumns.includes(columnNumber)) filteredColumns.push(columnNumber)
                        break
                    }
                }
            }
            data = filtered
        }

        this.data['filters'] = filters
        return data
    }

    groupData(data, group) {
        //
    }

    downloadData(data, filename, format) {
        let blob
        if (format == 'csv') {
            if (this.type == 'json') {
                blob = new Blob(json2csv(data), { 'type': 'text/csv' })
            } else {
                blob = new Blob(data, { 'type': 'text/csv' })
            }
        } else {
            if (this.type == 'json') {
                blob = new Blob(data, { 'type': 'text/json' })
            } else {
                blob = new Blob(csv2json(data), { 'type': 'text/json' })
            }
        }

        if (window.navigator.msSaveOrOpenBlob) {
            window.navigator.msSaveBlob(blob, filename)
        } else {
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = filename
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
        }
    }

    removeHTML(html) {
        let doc = new DOMParser().parseFromString(html, 'text/html')
        return doc.body.textContent || ''
    }

    quoteCommas(str) {
        if (str.indexOf(',') > -1 && str.substr(0, 1) != '"') str = `"${str}"`
        return str
    }

    substituteCommas(str) {
        return str.replace(/"[^"]+"/g, function (s) { 
            return s.replace(/,/g, '###')
        })
    }
}
