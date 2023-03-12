const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const mysql = require('mysql2');
const fs = require('fs');

const https = require('https');
const request = require('request-promise');
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;

const { default: axios } = require('axios');
// import getRemoteFile from './Serivce/saveLink.js';
const FormData = require('form-data');

// const domain = 'http://154.53.34.17:80'
// // const domain = 'http://localhost:8000'
// const url_api = {
//     'chapter': domain + '/api/create-chapter',
//     'get_data': domain + '/api/get-data-table',
//     'story': domain + '/api/create-story',
//     'category': domain + '/api/create-category',
// };

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

// const pool = mysql.createPool({
//     connectionLimit: 100, //important
//     host: "154.53.34.17",
//     user: "developer",
//     password: "Minhhiep0211@",
//     database: "9manhwa",
//     port: 3306,
//     debug: true,
// });


(async () => {
    await crawler_chapter('https://animefenix.tv/ver/ooyukiumi-no-kaina-7');
    //
})();

async function crawler_chapter(url) {


    const puppeteer_extra = require('puppeteer-extra')

    // add stealth plugin and use defaults (all evasion techniques) 
    const StealthPlugin = require('puppeteer-extra-plugin-stealth')
    puppeteer_extra.use(StealthPlugin())

    const { executablePath } = require('puppeteer')

    // puppeteer usage as normal 
    await puppeteer_extra.launch({
        headless: true, executablePath: executablePath(),
    }).then(async browser => {
        try {
            const page = await browser.newPage()
            await page.goto(url)
            await page.waitForTimeout(20000)
            // await sleep(15000);
            let content = await page.content();
            var $ = cheerio.load(content);
            let data = $("body").find('.iframe-container iframe').attr('src');
            console.log(data);

        } catch (err) {
            await browser.close();
            console.log(err);
        }
        await browser.close()
    })
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


