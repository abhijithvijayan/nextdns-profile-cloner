const BASE_URL = 'https://nextdns.abhijithvijayan.in';

/** @type {import('next-sitemap').IConfig} */
module.exports = {
    siteUrl: BASE_URL,
    generateRobotsTxt: true,
    changefreq: 'monthly',
    priority: 0.7,
};
