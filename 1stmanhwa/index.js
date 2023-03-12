const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const mysql = require('mysql2');
const fs = require('fs');

const http = require('http'); // or 'https' for https:// URLs
const https = require('https');
const request = require('request-promise');
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;

const compress_images = require("compress-images");

INPUT_path_to_your_images = "./zinmanga/images/*.{jpg,JPG,jpeg,JPEG,png,svg,gif}";
OUTPUT_path = "./zinmanga/uploads/";

const { default: axios } = require('axios');
const FormData = require('form-data');

const domain = 'http://154.53.34.17:80'
// const domain = 'http://localhost:8008'
const url_api = {
    'chapter': domain + '/api/create-chapter',
    'get_data': domain + '/api/get-data-table',
    'story': domain + '/api/create-story',
    'category': domain + '/api/create-category',
};

function sleep(fn, par) {
    return new Promise((resolve) => {
        // wait 3s before calling fn(par)
        setTimeout(() => resolve(fn(par)), 3000)
    })
}

const pool = mysql.createPool({
    connectionLimit: 100, //important
    host: "154.53.34.17",
    user: "developer",
    password: "Minhhiep0211@",
    database: "9manhwa",
    port: 3306,
    debug: true,
});

const domain_crawler = 'https://1stmanhwa.com';

(async () => {
    await crawler_chapter_to_story();
})();

async function crawler_chapter_to_story() {
    var storys = await getAllDataTable('st_story', 1000);

    for (let index = 0; index < storys.length; index++) {
        let item = storys[index];
        await crawler_story_chapter(item);
        console.log('\n Done ' + index + '---------------------------------------------------------');
    }
}


async function crawler_story_in_url() {
    let p = 43;

    while (true) {
        const browser = await puppeteer.launch({
            headless: false
        });

        const page = await browser.newPage();

        await page.goto('https://1stmanhwa.com/page/' + p);

        // // Type into search box.
        // await page.type('.devsite-search-field', 'Headless Chrome');
        //handle content
        let content = await page.content();

        var $ = cheerio.load(content);
        await browser.close();

        var result = [];

        $('div.page-content-listing').find('h3 a').each(function (index, item) {
            let href = $(item).attr('href');
            if (href && href != '#') {
                result.push(href);
            }
        });

        if (result.length > 0) {
            let i = 0
            for (let item of result) {
                await crawler_story(item);
                await sleep(1000);
                i++;
                console.log('\n Done page: ' + item + ' - ' + p + ' - ' + i);
            }
        } else {
            break;
        }
        console.log('\n Done page:' + p + '---------------------------------------------------------');
        ++p;
    }

    console.log('\n Done All');
}



async function crawler_category(crawler_href) { // cào category
    try {
        const browser = await puppeteer.launch({
            headless: false
        });
        const page = await browser.newPage();
        await page.goto(crawler_href);

        let content = await page.content();
        var $ = cheerio.load(content);
        await browser.close();
        let title = $('div.body-wrap').find('h1').text().trim();

        let slug = convertToSlug(title);

        let meta_title = `${title} Comics - Read Best ${title} Online Free On 9Manhwa`;
        let meta_description = `${title} comics online on 9Manhwa. Top free ${title} comic of all time to read. High quality comic images, daily updated chapters for comic lovers`;

        var obj = {
            title,
            slug,
            crawler_href,
            'is_status': 0,
            meta_title,
            meta_description,
        }
        await handle_category(obj);
        console.log("\n DONE: " + obj.title);
    } catch (err) {
        console.log("\n Error: " + obj.title);
    }
}
function handle_category(item) {
    return new Promise((resolve, reject) => {
        connection.query(`select id
                          from st_category
                          where crawler_href = '${item.crawler_href}' or slug like '%${item.slug}%'`, (error, elements) => {
            if (error) {
                return reject(error);
            }
            if (elements.length > 0) {
                return resolve(elements[0].id);
            } else {
                connection.query("INSERT INTO st_category SET ?",
                    {
                        ...item,
                        parent_id: 0
                    }
                    , function (error, results) {
                        if (error) {
                            return reject(error);
                        }
                        return resolve(results.insertId);
                    }
                )
            }
        });
    });
}

async function crawler_category_post(url, p = 1) {
    const browser = await puppeteer.launch({
        headless: false
    });

    const page = await browser.newPage();

    await page.goto(url + "?page=" + p);

    let content = await page.content();
    var $ = cheerio.load(content);
    var result = [];
    $('div.site-content .tab-content-wrap .badge-pos-1').each(function (index, item) {
        let title = $(item).find('h3 a').html()
        let obj = {
            'title': title,
            'crawler_url': $(item).find('h3 a').attr('href'),
            'image': 'images/' + convertToSlug(title) + '.jpg',
            'url_image': $(item).find('.img-responsive').attr('src')
        };
        result.push(obj);
    });

    await browser.close();

    if (result.length < 1) {
        console.log("\nEnd !!!" + url + "?page=" + p);
        return;
    } else {
        for (let item of result) {
            dowload(item.image, item.url_image);
            await crawler_story(item.crawler_url, item);
        }
        console.log("\nDone: " + url + "?page=" + p);
        await crawler_category_post(url, p + 1);
    }
}


async function crawler_story(crawler_href, obj = {}) {
    const browser = await puppeteer.launch({
        // headless: false
    });
    try {
        const page = await browser.newPage();

        await page.goto(crawler_href);
        let content_page = await page.content();
        var $ = cheerio.load(content_page);
        let title = $(".site-content").find('#manga-title h1').text().trim();
        let slug = convertToSlug(title);
        let meta_title = `${title} On 9Manhwa`;
        let meta_description = `Read ${title} Full chapters Online, English sub on your computer, Smartphone, and Mobile...Chapters updated daily for comics lovers`;

        let thumbnail = $('.summary_image img').attr('data-src');//og:image
        var author = [];
        $(".site-content").find('.summary_content .post-content_item .author-content a').each((i, item) => {
            let t = $(item).text();
            author.push({
                'title': t,
                'slug': convertToSlug(t),
                'crawler_href': $(item).attr('href')
            });
        })
        let author_title = (author.length > 0) ? author[0].title : '';
        var categorys = [];
        $(".site-content").find('.summary_content .post-content_item .genres-content a').each((i, item) => {
            let t = $(item).text();
            categorys.push({
                'title': t,
                'slug': convertToSlug(t),
                'crawler_href': $(item).attr('href')
            });
        })
        let arr = []
        $('.site-content .post-content_item').find('p').each(function (i, node) {
            arr.push($(node).text());
        });
        var description = '';

        // dowload image :
        var viewSource = await page.goto(thumbnail);
        let thum = `./1stmanhwa/images/${slug}.jpg`;
        await fs.writeFile(thum, await viewSource.buffer(), function (err) {
            if (err) {
                return console.log(err);
            }
        });
        await sleep(1000);

        let files = [
            thum
        ];

        if (arr) {
            var description = arr.sort(
                function (a, b) {
                    return b.length - a.length;
                }
            )[0];
        }
        let content = description
        let object = {
            title,
            slug,
            crawler_href,
            description,
            author_title,
            content,
            'is_status': 2,
            meta_title,
            'website': domain_crawler,
            'categorys': JSON.stringify(categorys),
            'author': JSON.stringify(author),
            meta_description,
            'folder': 'images/1stmanhwa'
        }

        let form_data = convertFormData(object, files);

        await axios({
            method: "post",
            url: url_api.story,
            data: form_data,
            headers: { "Content-Type": "multipart/form-data" },
        }).then(function (response) {
            let respon = response.data;
            for (let file of files) {
                if (fs.existsSync(file)) {
                    fs.unlinkSync(file);
                }
            }
            console.log("\n" + respon.message);
        }).catch(function (error, status) {
            console.log(error);
            console.log("Error !!! " + title);
        });
    } catch (err) {
        console.log(err);
        console.log('\nError story: ' + err);
    }
    await browser.close();
}


function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function crawler_story_chapter(item) {
    const browser = await puppeteer.launch({
        headless: false
    });
    try {
        const page = await browser.newPage();

        await page.goto(item.crawler_href);
        await sleep(2000);
        let content = await page.content();
        var $ = cheerio.load(content);
        let title_story = $(".site-content").find('#manga-title h1').text().trim();
        let chapters = [];
        $("body #manga-chapters-holder").find('li.wp-manga-chapter').each(function (index, item) {
            let obj = {
                'title': $(item).find('a').text().trim(),
                'crawler_url': $(item).find('a').attr('href')
            };
            chapters.push(obj);
        });

        await browser.close();
        let data = chapters.reverse();

        for (let index = 0; index < data.length; index++) {
            let element = data[index];
            await crawler_chapter(element.crawler_url, item.id, index + 1);
        }
        console.log('\Done chapter story: ' + title_story);
    } catch (err) {
        console.log('\nError story: ' + err);
    }
}


async function crawler_chapter(url_chapter, story_id = 0, chap = 0) {


    var puppeteer_extra = require('puppeteer-extra')
    // add stealth plugin and use defaults (all evasion techniques) 
    var StealthPlugin = require('puppeteer-extra-plugin-stealth')
    puppeteer_extra.use(StealthPlugin())
    var { executablePath } = require('puppeteer')
    // puppeteer usage as normal 
    await puppeteer_extra.launch({ headless: true, executablePath: executablePath() }).then(async browser => {
        try {
            const page = await browser.newPage()
            await page.goto(url_chapter)
            await page.waitForTimeout(1000)
            let content = await page.content();
            var $ = cheerio.load(content);

            let title = $(".site-content").find('h1#chapter-heading').text().trim();
            let images = [];
            $(".site-content").find('.page-break').each(function (index, item) {
                let obj = $(item).find('img').attr('src').trim();
                images.push(obj);
            });
            var obj = {
                'title': title || '',
                'story_id': story_id || 0,
                'chapter': chap,
                'crawler_href': url_chapter,
                'folder': 'images/1stmanhwa',
                'all_file_urls': JSON.stringify(images)
            }
            let form_data = convertFormData(obj);
            await axios({
                method: "post",
                url: url_api.chapter,
                data: form_data,
                headers: {
                    'Content-Type': `multipart/form-data; ${form_data.getBoundary()}`,
                },
            }).then(async function (response) {
                let respon = response.data;
                console.log("\n Done chap:" + chap + " - id:" + respon.id + "  Story_id:" + story_id + ' crawler manhwa top 1.js');
            }).catch(async function (error, status) {
                console.log(error);
                console.log("\nError !!! " + title);
            });
        } catch (err) {
            console.log(err);
        }
        await browser.close()
    })
    console.log("\n ---------------Done chap " + chap
        + "------------");
}

function handle_category(item) {
    return new Promise((resolve, reject) => {
        pool.query(`select id
                          from st_category
                          where crawler_href = '${item.crawler_href}' `, (error, elements) => {
            if (error) {
                return reject(error);
            }
            if (elements.length > 0) {
                return resolve(elements[0].id);
            } else {
                pool.query("INSERT INTO st_category SET ?",
                    {
                        ...item,
                        parent_id: 0
                    }
                    , function (error, results) {
                        if (error) {
                            return reject(error);
                        }
                        return resolve(results.insertId);
                    }
                )
            }
        });
    });
}



function convertToSlug(Text) {
    return Text.toLowerCase()
        .replace(/[^\w ]+/g, '')
        .replace(/ +/g, '-');
}



function getAllDataTable(table, offset = 0) {
    return new Promise((resolve, reject) => {
        pool.query("SELECT id , crawler_href FROM " + table + " where website like 'https://1stmanhwa.com%' ORDER BY id ASC limit 200 offset " + offset, (err, data) => {
            if (err) {
                return reject(err);
            }
            // rows fetch
            return resolve(data);
        });
    });

};

async function pushImageApi(file) {
    if (file) {
        var fileStream = fs.createReadStream(`${file}`);
        var form = new FormData();
        var files = [];
        form.append('files', fileStream, file);
        form.append('folder', 'manhwatop');
        return await axios({
            method: "post",
            url: "http:/localhost:8000/api/upload-file",
            data: form,
            headers: {
                'Content-Type': `multipart/form-data; boundary=${form._boundary}`,
            },
            // headers: { "Content-Type": "multipart/form-data" },
        })
    }
}

async function getAllData(table, page = 1, limit = 100) {
    return await axios({
        method: "get",
        url: url_api.get_data,
        data: {
            table, page, limit
        },
        headers: {},
    })
}

async function pushApiChapter(data) {
    if (data) {
        return await axios({
            method: "post",
            url: url_api.chapter,
            data: data,
            headers: {},
        })
    }
}

async function pushApiStory(data) {
    if (data) {
        console.log(url_api.story);
        return await axios({
            method: "post",
            url: url_api.story,
            data: data,
            headers: {},
        })
    }
}

function convertFormData(myObject = {}, files = []) {
    var form = new FormData();

    Object.entries(myObject).forEach(([key, value]) => {
        form.append(key, value);
    });

    if (files.length > 0) {
        var index = 1

        for (let file of files) {
            if (fs.existsSync(file)) {
                let fileStream = fs.createReadStream(file);
                // Pass file stream directly to form
                form.append('file_' + index, fileStream, file);
            }
            index++;
        }
    }
    return form;
}