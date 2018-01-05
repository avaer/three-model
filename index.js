const THREEOBJLoaderLib = require('./lib/OBJLoader.js');
const THREEMTLLoaderLib = require('./lib/MTLLoader.js');
const THREEDDSLoaderLib = require('./lib/DDSLoader.js');
const THREEColladaLoaderLib = require('./lib/ColladaLoader.js');
const THREEFBXLoaderLib = require('./lib/FBXLoader.js');
const THREEGLTFLoaderLib = require('./lib/GLTFLoader.js');
// const untar = require('js-untar');
const Zlib = require('./zlib_and_gzip.js');

module.exports = ({THREE}) => {

const THREEOBJLoader = THREEOBJLoaderLib({THREE});
const THREEMTLLoader = THREEMTLLoaderLib({THREE});
const THREEDDSLoader = THREEDDSLoaderLib({THREE});
const THREEColladaLoader = THREEColladaLoaderLib({THREE});
const THREEFBXLoader = THREEFBXLoaderLib({THREE, Zlib});
const THREEGLTFLoader = THREEGLTFLoaderLib({THREE, Zlib});

const _isWindowsAbsolute = url => /^[a-z]+:(?:\/|\\)/i.test(url);
const _isImageFileName = fileName => /\.(?:png|jpg|jfif|gif|bmp)$/i.test(fileName);
const _getFileTexture = file => {
  const fileUrl = file.getBlobUrl();

  const img = new Image();
  img.src = fileUrl;
  img.onload = () => {
    URL.revokeObjectURL(fileUrl);

    texture.needsUpdate = true;
  };
  img.onerror = err => {
    URL.revokeObjectURL(fileUrl);

    console.warn(err);
  };
  const texture = new THREE.Texture(
    img,
    THREE.UVMapping,
    THREE.ClampToEdgeWrapping,
    THREE.ClampToEdgeWrapping,
    THREE.LinearFilter,
    THREE.LinearFilter,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
    1
  );
  return texture;
};

let texturePathId = 0;
class TarLoader extends THREE.LoadingManager {
  constructor() {
    super();

    this.setURLModifier(url => {
      if (/^(?:blob:|^https:\/\/)/.test(url)) {
        return url;
      } else {
        const match = url.match(/(^.+?\/)(.+)$/);
        const prefix = match[1];
        let fileName = match[2];
        if (_isWindowsAbsolute(fileName)) {
          fileName = fileName.replace(/^.*(?:\/|\\)([^\/\\]+)$/, '$1');
        }

        const localFiles = this.files[prefix];
        let file = localFiles.find(file => file.name === fileName);
        if (!file && _isImageFileName(fileName)) {
          file = localFiles.find(file => _isImageFileName(file.name));
        }

        if (file) {
          return file.getBlobUrl();
        } else {
          return url;
        }
      }
    });
    this.onProgress =
    this.onError = url => {
      if (/blob:/.test(url)) {
        URL.revokeObjectURL(url);
      }
    };

    this.files = {};
  }

  setFiles(texturePath, files) {
    this.files[texturePath] = files;
  }

  clearFiles(texturePath) {
    this.files[texturePath] = null;
  }
}
const tarLoader = new TarLoader();
THREE.Loader.Handlers.add(/\.dds$/i, (() => {
  const loader = new THREEDDSLoader(tarLoader);
  loader.load = (load => function(url, onLoad, onProgress, onError) {
    return load.call(this, tarLoader.resolveURL(url), onLoad, onProgress, onError);
  })(loader.load);
  return loader;
})());

const _requestObj = (url, materials = null) => new Promise((accept, reject) => {
  const loader = new THREEOBJLoader(tarLoader);

  if (materials) {
    loader.setMaterials(materials);
  }

  loader.load(url, o => {
    accept(o);
  }, progress => {
    // console.log('progress', progress);
  }, err => {
    reject(err);
  });
});
const _requestMtl = (url, texturePath) => new Promise((accept, reject) => {
  const loader = new THREEMTLLoader(tarLoader);
  if (texturePath) {
    loader.setTexturePath(texturePath);
  }
  loader.load(url, o => {
    accept(o);
  }, progress => {
    // console.log('progress', progress);
  }, err => {
    reject(err);
  });
});
const _requestDae = (url, texturePath) => new Promise((accept, reject) => {
  const loader = new THREEColladaLoader(tarLoader);
  if (texturePath) {
    loader.setPath(texturePath);
  }
  loader.load(url, ({scene}) => {
    accept(scene);
  }, progress => {
    // console.log('progress', progress);
  }, err => {
    reject(err);
  });
});
const _requestFbx = url => new Promise((accept, reject) => {
  const loader = new THREEFBXLoader(tarLoader);
  loader.load(url, o => {
    accept(o);
  }, progress => {
    // console.log('progress', progress);
  }, err => {
    reject(err);
  });
});
const _requestGltf = (url, texturePath) => new Promise((accept, reject) => {
  const loader = new THREEGLTFLoader(tarLoader);
  if (texturePath) {
    loader.setPath(texturePath);
  }
  loader.load(url, ({scene}) => {
    accept(scene);
  }, progress => {
    // console.log('progress', progress);
  }, err => {
    reject(err);
  });
});
const _subDefaultTextures = (model, files) => {
  const defaultImageFile = files.find(file => _isImageFileName(file.name));
  if (defaultImageFile) {
    const _recurse = o => {
      if (o.constructor === THREE.Mesh && !o.material.map) {
        o.material.map = _getFileTexture(defaultImageFile);
      }

      for (let i = 0; i < o.children.length; i++) {
        _recurse(o.children[i]);
      }
    };
    _recurse(model);
  }
};

const isRenderableType = type => /^(?:obj|dae|fbx|gltf|tar)$/.test(type);
const requestModel = ({source, type}) => {
  switch (type) {
    case 'obj': {
      return _requestObj(source.url);
    }
    case 'dae': {
      return _requestDae(source.url);
    }
    case 'fbx': {
      return _requestFbx(source.url);
    }
    case 'gltf': {
      return _requestGltf(source.url);
    }
    case 'tar': {
      let modelFile = null;
      let loader = null;

      const texturePath = String(texturePathId++) + '/';
      tarLoader.setFiles(texturePath, source.files);

      if (modelFile = source.files.find(({name}) => /\.obj$/i.test(name))) {
        const materialFile = source.files.find(({name}) => /\.mtl$/i.test(name))

        if (materialFile) {
          const materialFileUrl = materialFile.getBlobUrl();

          loader = modelFileUrl => _requestMtl(materialFileUrl, texturePath)
            .then(materials => {
              URL.revokeObjectURL(materialFileUrl);

              return _requestObj(modelFileUrl, materials);
            })
            .catch(err => {
              URL.revokeObjectURL(materialFileUrl);

              return Promise.reject(err);
            });
        } else {
          loader = _requestObj;
        }
      } else if (modelFile = source.files.find(({name}) => /\.dae$/i.test(name))) {
        loader = url => _requestDae(url, texturePath);
      } else if (modelFile = source.files.find(({name}) => /\.fbx$/i.test(name))) {
        loader = _requestFbx;
      } else if (modelFile = source.files.find(({name}) => /\.gltf$/i.test(name))) {
        loader = url => _requestGltf(url, texturePath);
      }

      if (modelFile) {
        const modelFileUrl = modelFile.getBlobUrl();

        return loader(modelFileUrl)
          .then(preview => {
            URL.revokeObjectURL(modelFileUrl);
            tarLoader.clearFiles(texturePath);

            _subDefaultTextures(preview, source.files);

            return Promise.resolve(preview);
          })
          .catch(err => {
            URL.revokeObjectURL(modelFileUrl);
            tarLoader.clearFiles(texturePath);

            return Promise.reject(err);
          });
      } else {
        tarLoader.clearFiles(texturePath);

        return Promise.resolve(null);
      }
    }
    default: {
      return Promise.resolve(null);
    }
  }
};

return {
  isRenderableType,
  requestModel,
};

};
