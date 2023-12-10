const express = require('express');
const mongoose = require('mongoose');
const url = require('url');
const http = require('http');
const request = require('request-promise');
const cheerio = require('cheerio');
const colors = require('colors');
const httpProxyAgent = require('http-proxy-agent');

const { Schema } = mongoose;

const app = express();

const workoutSchema = new Schema({
    name: String,
    author: String,
    types: Array,
    name_notes: String,
    duration: String,
    duration_notes: String,
    exercise_notes: String,
    exercises: Array,
    id: String,
});

const Workout = mongoose.model('Workout', workoutSchema);

function proxyGenerator() {
    const proxyUrl = 'https://sslproxies.org/';
    let ipAddresses = [];
    let portNumbers = [];
    let randomNumbers = Math.floor(Math.random() * 100);

    return new Promise((resolve, reject) => {
        request(proxyUrl, function (error, response, html) {
            if (error || response.statusCode !== 200) {
                reject(error || `Failed to fetch proxies, status code: ${response.statusCode}`);
            }

            const $ = cheerio.load(html);
            $("td:nth-child(1)").each(function (index, value) {
                ipAddresses[index] = $(this).text();
            });

            $("td:nth-child(2)").each(function (index, value) {
                portNumbers[index] = $(this).text();
            });

            if (!ipAddresses.length || !portNumbers.length) {
                reject('No proxies found');
            }

            ipAddresses.push('0.0.0.0');
            const proxy = `http://${ipAddresses[randomNumbers]}:${portNumbers[randomNumbers]}`;
            resolve(proxy);
        });
    });
}

function addWorkoutToDatabase(data) {
    const { name, author, types, name_notes, duration, duration_notes, exercise_notes, exercises, id } = data;
    return (async () => {
        try {
            const idExist = await Workout.findOne({ id });

            if (!idExist) {
                console.log(`ID added: ${id}`.green);
            } else {
                console.error(`ID exists: ${id}`.red);
            }

            await Workout.create({ name, author, types, name_notes, duration, duration_notes, exercise_notes, exercises, id });
        } catch ({ message }) {
            console.log(message);
        }
    })();
}

function requestHandler(query, newProxy) {
    const endpoint = `http://woddrive-legacy-service.cfapps.io/getWod?type=${query}`;
    const options = url.parse(endpoint);
    const agent = new httpProxyAgent(newProxy);
    options.agent = agent;
    const chunks = [];

    return new Promise((resolve, reject) => {
        const req = http.get(options, function (res) {
            res.on('data', chunk => chunks.push(chunk));
            res.on('error', reject);
            res.on('end', () => {
                const responseString = Buffer.concat(chunks).toString('utf8');
                try {
                    const parsedResponse = JSON.parse(responseString);
                    resolve(parsedResponse);
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', reject);
    });
}

app.get('/', (req, res) => {
    res.send('Welcome to the homepage!');
});

async function main() {
    const PORT = 80;
    const DB_URL = 'mongodb://mongo:1Bd1hhgc-h3Hd5d1BFHAfH32h1AFc3gE@monorail.proxy.rlwy.net:55325';
    const myQuery = 'hero';
    const numberOfRequests = 200;
    let newProxy;
    let generateNewProxy = true;

    try {
        await mongoose.connect(DB_URL, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log(`Server up and running on http://0.0.0.0:${PORT}`);

        do {
            try {
                newProxy = await proxyGenerator();
                generateNewProxy = false;
                console.log(`Using proxy server ${newProxy}`);
            } catch (error) {
                console.error(`Error generating proxy: ${error.message}`);
                generateNewProxy = true; // Retry if there is an error in proxy generation
            }
        } while (generateNewProxy);

        for (let i = 0; i < numberOfRequests; i++) {
            try {
                const result = await requestHandler(myQuery, newProxy);
                if (result.id === null) generateNewProxy = true;
                await addWorkoutToDatabase(result);
            } catch (error) {
                console.error(`Error processing request: ${error.message}`);
            }
        }
    } catch ({ message }) {
        console.error(message);
    } finally {
        mongoose.disconnect();
        process.exit(0);
    }
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
    main();
});
