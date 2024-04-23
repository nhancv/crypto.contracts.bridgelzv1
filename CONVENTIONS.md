# REPOSITORY CONVENTIONS

## FORMAT & LINT

### Format standard

```
"prettier": "^2.4.0",
"prettier-plugin-solidity": "^1.0.0-beta.18",
```

### Lint

```
"solhint": "^3.3.6",
"solhint-plugin-prettier": "^0.0.5"
```

### Verify before commit

```
// package.json
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "lint": "./node_modules/.bin/solhint -f table 'src/active/**/*.sol' -w 0",
    "format": "./node_modules/.bin/prettier --write 'src/active/**/*.sol'",
    "prepare": "husky install"
  },
  "devDependencies": {
  ....
    "husky": "^7.0.2",
    "prettier": "^2.4.0",
    "prettier-plugin-solidity": "^1.0.0-beta.18",
    "pretty-quick": "^3.1.1",
    "solhint": "^3.3.6",
    "solhint-plugin-prettier": "^0.0.5"
  }


// .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx pretty-quick --staged && npm run lint
```

## COMMIT RULEs

- DO use Semantic Commit Messages: https://gist.github.com/joshbuchea/6f47e86d2510bce28f8e7f42ae84c716
- DO use Git Branching Model: https://nvie.com/posts/a-successful-git-branching-model
- DO run format before commit

```
npm run format
```

- DO run lint before commit

```
npm run lint
```

## CODING STYLE

Style guide: https://docs.soliditylang.org/en/v0.5.3/style-guide.html

### Function description

Each function must have a description as format below

```
  /**
   * @notice It allows the owner can set presenter to token
   * @dev This function is only callable by admin.
   * Requirements:
   * - .....
   *
   * @param _pPresenter: the address of the token to withdraw
   * input == address(0) if you want to remove Presenter
   *
   * @return n/a
   */
   function fSetPresenter(address _pPresenter) external onlyOwner {
    presenter = _pPresenter;
  }
```

### Explanation

- Remember correct grammar and spelling
- First character need to be Uppercase

```
+ DO NOT: /* @dev buy a item */
+ DO: /* @dev Buy a item */
```

- Each variable or logic line should have at least an explanation

```
Ex1
  // users[address] => UserInfo
  mapping(address => bool) public users;

Ex2
  // Exclude addresses
  fAddWhitelist(owner(), true);
```

### Sorting

```
    1. Variables: Struct -> constant -> private -> public
    2. Events
    3. Constructor/Initializer
    2. Modifiers
    4. Function: Sort by order of function required (not visibitity)
      Ex:
      function0() {x = function1();}

      // Function 1 called in function, it will be below function0()
      function1() {}

    5. Group function by public/private. The private group should place at end of the file.
```

### Naming

#### Folder name

Use snake_case: lowercase with underscore.

Ex: scripts_local

### File name

- Js file: snake_case -> lowercase with underscore.
- Sol file: UpperCamelCase

#### Variable name

- Variable: camelCase
- Constant: CONSTANT_CASE
- Prefix/Suffix rules:

```
    + Global public: normal without prefix or suffix (Ex: name)
    + Global private: Prefix _ (Ex: _name)
    + Function params: Prefix _ (Ex: _pName)
    + Function returns: Prefix _ (Ex: _rName)
    + Function local vars: Suffix _ (Ex: name_)
    + Function public name: Prefix f (Ex: fName() )
    + Function private name: Refix _f (Ex: _fName() )
    + Modifier name: Prefix m (Ex: mRestricted() )
```

### Function name template

DO USE `fAdd, fGet, fSet, fDel, fLen` for common cases

Example: fAddUser, fGetUser, fSetUser, fDelUser, fLenUsers

### Others

- DO USE this order of visibility type to save gas: `private -> internal (for override) -> external (for outside contract call) -> public`
- DO USE `pagination` for `array` type
- DO USE `zero address validation` on owner functions to avoid accidentally case
- DO USE readable digits. Ex: `250e6` or `250_000_000` is easier to read than `250000000`
- DO USE `fixed pragma` solidity version for all contracts: Ex: `0.8.4` is better than `^0.8.4`
- DO NOT USE `boolean` equality checking. Ex: `bool z = true`. DO USE: `if (z) {}` instead of `if(z==true) {}`
- DO NOT USE `modifier` if not needed, it's consume more gas than normal checking function
- DO NOT USE `array` inside `public Struct`
- REMOVE `unused function/variables` for production
- DO Decentralization related risks:
  - DO USE `Ownable` to prove the Contract owner ONLY (to validate, update metadata on scan, etc)
  - DO NOT CENTRALIZE almost config functions with `onlyOwner` modifier.
  - DO DECENTRALIZE privilege with `AccessControl` or `Multi-Signature`.
  - DO EMIT event in all config functions.
  - DO USE multi deployer address to deploy contract.
