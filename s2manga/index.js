const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const mysql = require('mysql2');
const fs = require('fs');
const Helper = require('../Helper/Function');

const http = require('http'); // or 'https' for https:// URLs
const https = require('https');
const request = require('request-promise');
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;

const compress_images = require("compress-images");

var INPUT_path_to_your_images = "./s2manga/images/*.{jpg,JPG,jpeg,JPEG,png,svg,gif}";
var OUTPUT_path = "./s2manga/uploads/";

const {
    default: axios
} = require('axios');
const FormData = require('form-data');

const domain = 'http://154.53.34.17:80'
// const domain = 'http://localhost:8000'
const url_api = {
    'chapter': domain + '/api/create-chapter',
    'get_data': domain + '/api/get-data-table',
    'story': domain + '/api/create-story',
    'category': domain + '/api/create-category',
};

const pool = mysql.createPool({
    connectionLimit: 100, //important
    host: "154.53.34.17",
    user: "developer",
    password: "Minhhiep0211@",
    database: "9manhwa",
    port: 3306,
    debug: true,
});

const domain_crawler = 'https://s2manga.com';

(async () => {
    // var object = [
    //     'https://s2manga.com/manga-genre/comedy/',
    //     'https://s2manga.com/manga-genre/drama/',
    // ]
    // for (let item of object) {
    //     await crawler_story_in_url(item);
    // }

    // await crawler_category();
    await crawler_chapter_to_story(); 
})();





async function crawler_chapter_to_story() {
    var storys = await getAllDataTable('st_story', 0); 
    for (let index = 0; index < storys.length; index++) {
        let item = storys[index];
        await crawler_story_chapter(item);
        console.log('\n Done ' + index + '---------------------------------------------------------');
    }
}


async function crawler_story_in_url(url) {
    let p = 1;
    while (true) {
        const browser = await puppeteer.launch({
            headless: false
        });

        const page = await browser.newPage();

        await page.goto(`${url}?page=${p}`);

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
                await Helper.sleep(1000);
                i++;
                console.log('\n Done page: ' + item + ' - ' + p + ' - ' + i);
            }
        } else {
            break;
        }
        console.log('\n Done ' + url + ':' + p + '---------------------------------------------------------');
        ++p;
    }

    console.log('\n Done All');
}



async function crawler_category() { // cào category
    try {
        const browser = await puppeteer.launch({
            headless: false
        });
        const page = await browser.newPage();
        await page.goto(domain_crawler);

        let content = await page.content();
        var $ = cheerio.load(content);
        await browser.close();
        let arr = [];
        $('header .sub-nav_list li').find('a').each((i, item) => {
            arr.push({
                'title': $(item).html(),
                'crawler_href': $(item).attr('href')
            })
        });

        for (let item of arr) {
            let slug = convertToSlug(item.title);
            let meta_title = `${item.title} Comics - Read Best ${item.title} Online Free On 9Manhwa`;
            let meta_description = `${item.title} comics online on 9Manhwa. Top free ${item.title} comic of all time to read. High quality comic images, daily updated chapters for comic lovers`;
            var obj = {
                'title': item.title,
                slug,
                'crawler_href': item.crawler_href,
                'is_status': 0,
                meta_title,
                meta_description,
            }
            await handle_category(obj);
            console.log("\n DONE: " + obj.title);
        }
        console.log("\Done All");
    } catch (err) {
        // console.log("\n Error: " + obj.title);
        console.log(err);
    }
}

function handle_category(item) {
    return new Promise((resolve, reject) => {
        pool.query(`select id
                          from st_category
                          where crawler_href = '${item.crawler_href}' or slug like '%${item.slug}%'`, (error, elements) => {
            if (error) {
                return reject(error);
            }
            if (elements.length > 0) {
                return resolve(elements[0].id);
            } else {
                pool.query("INSERT INTO st_category SET ?", {
                    ...item,
                    parent_id: 0
                }, function (error, results) {
                    if (error) {
                        return reject(error);
                    }
                    return resolve(results.insertId);
                })
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
        headless: false
    });
    try {
        const page = await browser.newPage();

        await page.goto(crawler_href);
        let content_page = await page.content();
        var $ = cheerio.load(content_page);
        let title = $(".site-content").find('.post-title h1').text().trim();
        let regex = /Hot/i;
        title = title.replace(regex, '');
        title = title.replace('\n', '');
        let slug = convertToSlug(title);
        let meta_title = `${title} On 9Manhwa`;
        let meta_description = `Read ${title} Full chapters Online, English sub on your computer, Smartphone, and Mobile...Chapters updated daily for comics lovers`;

        let thumbnail = $('.summary_image img').attr('src'); //og:image

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

        $('.description-summary').find('p').each(function (i, node) {
            arr.push($(node).text());
        });
        var description = '';
        await Helper.sleep(1000);
        // dowload image :
        var viewSource = await page.goto(thumbnail);
        let thum = `./s2manga/images/${slug}.jpg`;

        await fs.writeFile(thum, await viewSource.buffer(), function (err) {
            if (err) {
                return console.log(err);
            }
        });
        await Helper.sleep(1000);

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
            'folder': 'images/s2manga'
        }
        let form_data = convertFormData(object, files);

        await axios({
            method: "post",
            url: url_api.story,
            data: form_data,
            headers: {
                "Content-Type": "multipart/form-data"
            },
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


async function crawler_story_chapter(item) {
    const browser = await puppeteer.launch({
        headless: false
    });
    try {
        const page = await browser.newPage();

        await page.goto(item.crawler_href);
        await Helper.sleep(2000);
        let content = await page.content();
        var $ = cheerio.load(content);
        let title_story = $(".site-content").find('#manga-title h1').text().trim();
        let chapters = [];
        $("body ul.version-chap").find('li.wp-manga-chapter').each(function (index, item) {
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
    var {
        executablePath
    } = require('puppeteer')
    // puppeteer usage as normal 
    await puppeteer_extra.launch({
        headless: true,
        executablePath: executablePath()
    }).then(async browser => {
        try {
            const page = await browser.newPage()
            await page.goto(url_chapter)
            await page.waitForTimeout(1000)
            let content = await page.content();
            var $ = cheerio.load(content);

            let title = $(".site-content").find('h1#chapter-heading').text().trim();
            let images = [];
            $(".site-content").find('.page-break').each(function (index, item) {
                let obj = {
                    index,
                    'url': $(item).find('img').attr('src').trim(),
                    'path': convertToSlug(title + ' img ' + (index + 1)) + '.jpg',
                }
                images.push(obj);
            });
            
            let files = await saveImageInFolder(page, browser, images, './s2manga/images' ,  convertToSlug(title));
            console.log(files);
            var obj = {
                'title': title || '',
                'story_id': story_id || 0,
                'chapter': chap,
                'crawler_href': url_chapter,
                'folder': 'images/s2manga',
            }

            let form_data = convertFormData(obj, files);

            await axios({
                method: "post",
                url: url_api.chapter,
                data: form_data,
                headers: {
                    'Content-Type': `multipart/form-data; ${form_data.getBoundary()}`,
                },
            }).then(async function (response) {
                console.log(response);
                return;
                let respon = response.data;

                console.log("\n Done chap:" + chap + " - id:" + respon.id + "  Story_id:" + story_id + ' crawler manhwa top 1.js');
            }).catch(async function (error, status) {   
                console.log(error);
                console.log("\nError !!! " + title);
            });
            if(files){
                for (let file of files) {
                    let path = `./${file.file}`;
                    if (fs.existsSync(path)) {
                        fs.unlinkSync(path);
                    }
                }
            }
        } catch (err) {
            console.log(err);
        }
        await browser.close()
    })
    console.log("\n ---------------Done chap " + chap +
        "------------");
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
                pool.query("INSERT INTO st_category SET ?", {
                    ...item,
                    parent_id: 0
                }, function (error, results) {
                    if (error) {
                        return reject(error);
                    }
                    return resolve(results.insertId);
                })
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
        pool.query("SELECT id , crawler_href FROM " + table + " where website like 'https://s2manga.com%' ORDER BY id ASC limit 500 offset " + offset, (err, data) => {
            if (err) {
                return reject(err);
            }
            // rows fetch
            return resolve(data);
        });
    });

};

async function pushApiData(url, form_data) {
    if (data) {
        return await axios({
            method: "post",
            url: url_api.chapter,
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
        var index = 0
        for (let obj of files) {
            let fileStream = obj.content;
            let file = obj.file;
            form.append('file_' + index, fileStream, file);
            index++;
        }
    }
    return form;
}


async function saveImageInFolder(page, browser, images = [], folder = '', slug = '') {
    var files = [];
    for (let obj of images) {
        await page.click('div.reading-content img#image-' + obj.index);
        let page_new = await browser.newPage(); // open new tab
        var viewSource = await page_new.goto(obj.url);
        let thum = `${folder}/${obj.path}`;
        await fs.writeFile(thum, await viewSource.buffer(), function (err) {
            if (err) {
                return console.log(err);
            }
        });
        await page_new.close();
        compress_Images( thum);
        await Helper.sleep(500);
        if (fs.existsSync(`./s2manga/uploads/${obj.path}`)) {
            fs.unlink(thum, function (err) {
                if (err) throw err;
            }); 
            thum = `./s2manga/uploads/${obj.path}`;
        }
        files.push({
            'content': fs.createReadStream(`${thum}`),
            'file': thum
        })
    }
    return files;
}

async function compress_Images(input) {
    // let input =  "./s2manga/images/"+ slug +"*.{jpg,JPG,jpeg,JPEG,png,svg,gif}";
    // console.log(input);
    // return;
    try {
        await compress_images(
           input,
            OUTPUT_path, {
                compress_force: false,
                statistic: true,
                autoupdate: false
            },
            false, {
                jpg: {
                    engine: "mozjpeg",
                    command: ["-quality", "60"]
                }
            }, {
                png: {
                    engine: "pngquant",
                    command: ["--quality=20-50", "-o"]
                }
            }, {
                svg: {
                    engine: "svgo",
                    command: "--multipass"
                }
            }, {
                gif: {
                    engine: "gifsicle",
                    command: ["--colors", "64", "--use-col=web"],
                },
            },
            async function (error, completed, statistic) {
                if (error) {
                    console.log("==========");
                    fs.unlink(statistic.path_out_new, function (err) {
                        if (err) throw err;
                        console.log("File deleted!");
                    });
                    console.log("==========");
                } 
            }
        );
    } catch (e) {
        return;
    }
}