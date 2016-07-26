import Express from 'express';
import mongoose from 'mongoose';
import Promise from 'bluebird';
import bodyParser from 'body-parser';
import invariant from 'invariant';
import _ from 'lodash';
import {
  SUCCESS,
  BAD_REQUEST,
  SERVER_ERROR,
} from './errorCodes';

Promise.promisifyAll(mongoose);

// global stuffs
global.Promise = Promise;
global.Mongoose = mongoose;
global._ = _;

// models
global.Tag = require('./models/tag').default;
global.Repo = require('./models/repo').default;
global.User = require('./models/user').default;

const app = new Express();

app.use(bodyParser({ extended: false }));
app.use(bodyParser.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.get('/', (req, res) => {
  Tag.findAsync()
    .then(result => {
      res.send(result);
    })
    .catch(err => {
      res.send(`err ${err}`);
    });
});

app.get('/getRepo', (req, res) => {
  let { tags: tags = '' } = req.query;
  tags = tags.split(',')
    .map(t => t.trim())
    .filter(t => t !== '');

  const getRepoByTag = (tag) => (
    Tag
      .find({ name: tag })
      .populate('repos')
      .exec((err, t) => {
        if (err) {
          return Promise.reject(err);
        }

        return Promise.resolve(t);
      })
      .then(foundTags => (
        _.first(foundTags) || { repos: [] }
      ))
      .then(results => {
        const getTagFromId = (id) => (
          Tag
          .findOne({ _id: id })
          .populate('tags')
          .exec((err, arrTags) => {
            if (err) {
              return Promise.reject(err);
            }

            return Promise.resolve(arrTags);
          })
        );

        const populateRepo = (repo) => (
          Promise.props({
            name: Promise.resolve(repo.name),
            tags: Promise.all(repo.tags.map(getTagFromId)),
          })
        );

        return Promise.all(results.repos.map(r => populateRepo(r)));
      })
  );

  return Promise.all(tags.map(t => getRepoByTag(t)))
    .then(_.flatten)
    .then(repos => _.unionBy(repos, 'name'))
    .then((results) => {
      res.status(SUCCESS).json({ data: results });
      return results;
    })
    .catch(err => {
      res.status(SERVER_ERROR).json({ errorMessage: err.toString() });
    });
});

app.post('/save', (req, res) => {
  let { tags: tags = '', name: repoName = '' } = req.body; // eslint-disable-line
  tags = tags.split(',')
    .map(t => t.trim().toLowerCase())
    .filter(t => t !== '');

  const repo = new Repo();
  repo.name = repoName;

  Promise.resolve()
    .then(() => {
      invariant(repoName, 'Name is missing');
      return true;
    })
    .then(() => {
      invariant(tags.length > 0, 'No tags?');
      return true;
    })
    .then(() => {
      const findTag = tagName => (
        Tag
        .findAsync({ name: tagName })
        .then(foundTags => {
          if (foundTags.length === 0) {
            const newTag = new Tag();
            newTag.name = tagName;
            return newTag.saveAsync();
          }

          const firstRepo = _.first(foundTags);
          return firstRepo;
        })
        .then(tag => {
          tag.repos.push(repo._id); // eslint-disable-line
          return tag.saveAsync();
        })
      );

      const promises = _.reduce(tags, (acc, t) => {
        acc[t] = findTag(t.toLowerCase()); // eslint-disable-line
        return acc;
      }, {});

      return Promise.props(promises);
    })

    .then(foundTags => {
      repo.tags = _.reduce(foundTags, (acc, t) => {
        acc.push(t._id); // eslint-disable-line
        return acc;
      }, []);
      return repo.saveAsync();
    })
    .then(foundRepo => (
      Repo
      .findOne({ _id: foundRepo })
      .populate('tags')
      .exec((err, result) => {
        if (err) {
          return Promise.reject(err);
        }

        return Promise.resolve(result);
      })
    ))
    .then(result => {
      res.status(SUCCESS).json({
        repo: result,
      });
      return result;
    })

    .catch(err => {
      res.status(BAD_REQUEST).json({
        errorMessage: err.toString(),
      });
    });
});

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost/test';
mongoose.connect(mongoUri);

const port = process.env.PORT || 3333;

app.listen(port, () => {
  console.log(`🐶  server runs on port ${port}`);
});
