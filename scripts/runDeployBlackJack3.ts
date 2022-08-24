import { deployBlackJack3 as main } from "../deploy/BlackJack3";

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
