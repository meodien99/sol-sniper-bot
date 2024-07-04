import fs from 'node:fs/promises';
import osPath from 'path';
import EventEmitter from "events";
import { v4 as uuidv4 } from 'uuid';
import _get from 'lodash.get';
import _set from 'lodash.set';
import _omit from 'lodash.omit';

const emptyStringObject = JSON.stringify({});

export class DB extends EventEmitter {
  private path: string;
  private storage: Record<string, any> = {};

  constructor(path: string) {
    super();

    this.path = osPath.join(osPath.resolve("./"), path);

    const init = async () => {
      try {
        const data = await fs.readFile(this.path, 'utf8');

        this.storage = JSON.parse(data || emptyStringObject);
      } catch (err: any) {
        throw err;
      }

      this.emit('ready');
    }

    init();
  }

  /**
   * 
   * @param collection string
   * @param value any
   * 
   * DB.set('a', {name: 'Name'});
   * // {
   *  a: {
   *    <uuid>: {
   *      name: 'Name'
   *    }
   *  }
   * }
   */
  public async set(collection: string, value: any, _id?: string): Promise<void> {
    try {
      if (typeof collection !== "string") {
        throw new TypeError("Collection should be a string");
      }

      const id = _id || uuidv4();

      _set(this.storage, [collection, id], value);

      await this.save();
    } catch (err) {
      throw err;
    }
  }

  public async delete(collection: string, _id: string): Promise<void> {
    const orignal = await this.get(collection);
    const omitted = _omit(orignal, [_id]);

    this.storage = {
      ...this.storage,
      [collection]: omitted
    };

    await this.save();
  }


  /**
   * 
   * @param collection string
   * @param value any
   * 
   * const data = {
   *  a: {
   *    <uuid1>: {
   *      name: 'Name'
   *    },
   *    <uuid2>: {
   *      name: 'Name 2'
   *    }
   *  }
   * }
   * 
   * DB.get('a');
   * // => {
   *    <uuid1>: {
   *      name: 'Name'
   *    },
   *    <uuid2>: {
   *      name: 'Name 2'
   *    }
   *  }
   *
   * 
   * DB.get('a', <uuid1>) // => { name: 'Name' } 
   */
  public async get(collection: string, _id?: string): Promise<any> {
    try {
      if (typeof collection !== "string") {
        throw new TypeError("Collection should be a string");
      }

      const path = [collection];

      if (_id) {
        path.push(_id);
      }

      return _get(this.storage, path);
    } catch (err) {
      throw err;
    }
  }

  /**
   * 
   * @param collection string
   * @param value any
   * 
   * const data = {
   *  a: {
   *    <uuid1>: {
   *      name: 'Name'
   *    },
   *    <uuid2>: {
   *      name: 'Name 2'
   *    }
   *  }
   * }
   * 
   * DB.getPrimaryIdByKey('a', 'Name 2', 'name');
   * // => <uuid2>
   * 
   * const data2 = {
   *  a: {
   *    <uuid1>: [{ name: 'Name'}, {name: 'Name 3'}]
   *    <uuid2>: [{ name: 'Name 2'}]
   *  }
   * }
   * 
   * DB.getPrimaryIdByKey('a', 'Name 3', 'name');
   * // => <uuid1>
   * const data3 = {
   *  a: {
   *    <uuid1>: 'Name 1'
   *    <uuid2>: 'Name 2'
   *  }
   * }
   * 
   * DB.getPrimaryIdByKey('a', 'Name 2');
   * // => <uuid2>
   */
  public async getPrimaryIdByValueNKey(collection: string, value: any, key?: string,): Promise<string | undefined> {
    try {
      if (typeof collection !== "string") {
        throw new TypeError("Collection should be a string");
      }

      const collections = _get(this.storage, [collection], {});
      let found;

      const array = Object.keys(collections);

      for (let i = 0; i < Object.keys(collections).length; i++) {
        const _id = array[i];
        const sample = _get(collections, [_id]);

        if (key) {
          if (typeof sample === 'object') {
            if (_get(sample, [key], null) === value) {
              found = _id;
              break;
            }
          } else if (Array.isArray(sample)) {
            for (let j = 0; j < sample.length; j++) {
              if (sample[j][key] === value) {
                found = _id;
                break;
              }
            }
          }
        } else {
          if (sample === value) {
            found = _id;
            break;
          }
        }
      }

      return found;
    } catch (err) {
      throw err;
    }
  }

  public async save() {
    await fs.writeFile(this.path, JSON.stringify(this.storage));
  }

}

// async function start() {
//   const db = new DB('files/db.json');

//   console.log('starting...');
//   db.on('ready', async () => {
//     console.log('db started...');

//     await db.set('markets', {
//       name: "test1",
//       id: '1'
//     });
//     await db.set('markets', {
//       name: "test2",
//       id: '2'
//     });

//     const markets = await db.get('markets');

//     console.log('>markets', markets);

//     const pId = await db.getPrimaryIdByValueNKey('markets', '2', 'id');
//     console.log('>pId', pId);

//     const test1 = await db.get("markets", pId);
//     console.log('>1', test1);

//     // await db.set('markets', 'test212', pId);

//     // const test2 = await db.get("markets", pId);
//     // console.log('>2', test2);

//     await db.delete("markets", pId!);
//   });
// }

// start();