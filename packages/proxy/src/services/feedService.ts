import * as request from 'request';
import {Article, ContentResolutionType, FeedParser, FeedParserOptions, FeedParserResult, FeedUrl, OutputType} from '@rss-proxy/core';
import {SourceType} from '@rss-proxy/core/dist/feed-parser';
import {JSDOM} from 'jsdom';
import {Feed} from 'feed';
import {LogCollector} from '@rss-proxy/core/dist/LogCollector';


export const feedService =  new class FeedService {
  async mapToFeed(url: string, options: FeedParserOptions): Promise<FeedParserResult> {

    const html = await this.download(url, options.source);
    const feedUrls = this.findFeedUrls(html);

    return this.generateFeedFromUrl(url, html, options, feedUrls);
  }

  private download(url: string, source: SourceType): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const options = {method:'GET', url, headers: {"content-type": "text/plain"}};
      request(options, (error, serverResponse, html) => {
        if (!error && serverResponse && serverResponse.statusCode === 200) {
          resolve(html);
        } else {
          reject(error);
        }
      });
    });
  }


  private async generateFeedFromUrl(url: string, html: string, options: FeedParserOptions, feeds: FeedUrl[]): Promise<FeedParserResult> {

    const logCollector = new LogCollector();

    const doc = new JSDOM(html).window.document;
    const feedParser = new FeedParser(doc, options, logCollector);

    const feed = new Feed({
      title: doc.title,
      // description: doc.,
      id: url,
      link: url,
      // language: 'en', // optional, used only in RSS 2.0, possible values: http://www.w3.org/TR/REC-html40/struct/dirlang.html#langcodes
      // favicon: "http://example.com/favicon.ico",
      copyright: "All rights reserved 2013, John Doe",
      // updated: new Date(2013, 6, 14), // optional, default = today
      generator: "rss-proxy", // optional, default = 'Feed for Node.js'
      feedLinks: {
        json: "https://example.com/json",
        atom: "https://example.com/atom"
      },
      // author: {
      //   name: "John Doe",
      //   email: "johndoe@example.com",
      //   link: "https://example.com/johndoe"
      // }
    });

    // todo pass options.parser
    const rules = feedParser.getArticleRules();

    const articles = feedParser.getArticlesByRule(rules[0]);
    articles.forEach((article: Article) => {
      feed.addItem({
        title: article.title,
        link: article.link,
        published: new Date(),
        date: new Date(),
        description: article.summary.join(' / '),
        content: article.content
      });
    });

    return Promise.resolve({
      usesExistingFeed: false,
      logs: logCollector.logs(),
      options,
      rules: rules,
      feeds,
      html,
      articles: articles,
      feedOutputType: options.output,
      feed: await this.tryAddDeepContent(options.content)(feed)
        .then(this.renderFeed(options.output))
    });
  }

  private tryAddDeepContent(content: ContentResolutionType): (feed: Feed) => Promise<Feed> {
    return (feed: Feed) => {
      if (content === ContentResolutionType.DEEP) {
        console.log('Would use puppeteer to resolve deep content');
      }
      return Promise.resolve(feed);
    };
  }

  private findFeedUrls(html: string): FeedUrl[] {

    const types = ["application/atom+xml", "application/rss+xml", "application/json"];

    const doc = new JSDOM(html).window.document;

    return types.map(type => Array.from(doc.querySelectorAll(`link[href][type="${type}"]`)))
      .flat(1)
      .map(linkElement => {
        return {
          name: linkElement.getAttribute('title'),
          url: linkElement.getAttribute('href'),
        }
      });
  }

  private renderFeed(output: OutputType) {
    return (feed: Feed) => {
      switch (output) {
            case OutputType.ATOM:
              return feed.atom1();
            case OutputType.RSS:
              return feed.rss2();
            default:
            case OutputType.JSON:
              return feed.json1()
          }
    };
  }

};