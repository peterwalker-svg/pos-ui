import {render} from 'preact';

/**
 * Part Lookup Tile Component
 * Displays a clickable tile in the POS UI that opens the Part Finder modal
 */
export default async () => {
  render(<Extension />, document.body);
}

function Extension() {
  return (
    <s-tile
      heading="Part Finder"
      subheading="Search parts by vehicle"
      onClick={() => shopify.action.presentModal()}
    />
  );
}