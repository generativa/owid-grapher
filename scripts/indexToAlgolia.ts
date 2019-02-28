import * as algoliasearch from 'algoliasearch'
import * as _ from 'lodash'

import * as wpdb from 'db/wpdb'
import { ALGOLIA_ID  } from 'settings'
import { ALGOLIA_SECRET_KEY } from 'serverSettings'
import { formatPost } from 'site/server/formatting'
import { chunkParagraphs } from 'utils/search'
import { htmlToPlaintext } from 'utils/string'
import { countries } from 'utils/countries'

async function indexToAlgolia() {
    const client = algoliasearch(ALGOLIA_ID, ALGOLIA_SECRET_KEY)
    const finalIndex = await client.initIndex('pages')
    const tmpIndex = await client.initIndex('pages_tmp')

    // 2. Copy the settings, synonyms and rules (but not the records)
    await client.copyIndex(finalIndex.indexName, tmpIndex.indexName, [
        'settings',
        'synonyms',
        'rules'
    ]);
  
    const rows = await wpdb.query(`SELECT * FROM wp_posts WHERE (post_type='post' OR post_type='page') AND post_status='publish'`)

    const records = []

    for (const country of countries) {
        records.push({
            objectID: country.slug,
            type: 'country',
            slug: country.slug,
            title: country.name,
            content: `All available indicators for ${country.name}.`
        })
    }

    for (const row of rows) {
        const rawPost = await wpdb.getFullPost(row)
        const post = await formatPost(rawPost, { footnotes: false })
        const postText = htmlToPlaintext(post.html)
        const chunks = chunkParagraphs(postText, 1000)

        // let importance = 0
        // if (post.type === 'entry')
        //     importance = 3
        // else if (post.type === 'explainer')
        //     importance = 2
        // else if (post.type === 'fact')
        //     importance = 1

        let i = 0
        for (const c of chunks) {
            records.push({
                objectID: `${row.ID}-c${i}`,
                postId: post.id,
                type: post.type,
                slug: post.slug,
                title: post.title,
                excerpt: post.excerpt,
                authors: post.authors,
                date: post.date,
                modifiedDate: post.modifiedDate,
                content: c,
                // importance: importance
            })
            i += 1
        }
    }

    for (let i = 0; i < records.length; i += 1000) {
        await tmpIndex.saveObjects(records.slice(i, i+1000))
    }
    await client.moveIndex(tmpIndex.indexName, finalIndex.indexName);

    wpdb.end()
}

indexToAlgolia()