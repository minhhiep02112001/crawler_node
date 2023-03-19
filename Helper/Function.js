
 function downloadImage(file, url) {
    let localFile = fs.createWriteStream(file);
    return https.get(url, function (response) {
        var len = parseInt(response.headers['content-length'], 10);
        var cur = 0;
        var total = len / 1048576; //1048576 - bytes in 1 Megabyte

        response.on('data', function (chunk) {
            cur += chunk.length;
            // showProgress(file, cur, len, total);
        });

        response.on('end', function () {
            console.log("Download complete");
        });
        response.pipe(localFile);
    });
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

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

module.exports = {
    convertFormData,
    sleep
}