import {render} from 'preact';

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