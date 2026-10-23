import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ArtistsView } from "./ArtistsView";
import { useStore } from "../store/store";
import type { CollectionItem, Track } from "../../shared/types";

vi.mock("../store/store", () => ({
  useStore: vi.fn(),
}));

vi.mock("./Collection/ItemsGrid", () => ({
  ItemsGrid: ({ items }: { items: CollectionItem[] }) => (
    <div data-testid="items-grid">{items.length} items</div>
  ),
}));

vi.mock("./Playlist/AddToPlaylistModal", () => ({
  AddToPlaylistModal: () => null,
}));

vi.mock("lucide-react", () => ({
  ArrowLeft: () => <span />,
  ExternalLink: () => <span />,
  Search: () => <span />,
  Play: () => <span />,
  SkipForward: () => <span />,
  List: () => <span />,
  Music: () => <span />,
  MoreHorizontal: () => <span />,
  Download: () => <span />,
  RefreshCw: ({ className }: { className?: string }) => (
    <span data-testid="icon-refresh" className={className} />
  ),
}));

const artistName = "Mock Artist";
const artistId = "name-mock-artist";

function track(partial: Partial<Track> & Pick<Track, "id" | "title">): Track {
  return {
    artist: artistName,
    album: "Album",
    duration: 100,
    artworkUrl: "",
    streamUrl: "",
    bandcampUrl: "",
    isCached: false,
    ...partial,
  };
}

function albumItem(
  id: string,
  title: string,
  url: string,
  tracks: Track[] = [],
): CollectionItem {
  return {
    id: `item-${id}`,
    type: "album",
    token: `tok-${id}`,
    purchaseDate: new Date().toISOString(),
    album: {
      id,
      title,
      artist: artistName,
      artworkUrl: "",
      bandcampUrl: url,
      tracks,
      trackCount: tracks.length,
    },
  };
}

describe("ArtistsView Play All", () => {
  const clearQueue = vi.fn().mockResolvedValue(undefined);
  const addTracksToQueue = vi.fn().mockResolvedValue(undefined);
  const playQueueStart = vi.fn().mockResolvedValue(undefined);
  const getAlbumDetails = vi.fn();
  const showToast = vi.fn();

  const albumOneTracks = [
    track({ id: "t1", title: "One A", streamUrl: "http://s/1" }),
    track({ id: "t2", title: "One B", streamUrl: "http://s/2" }),
  ];
  const albumTwoTracks = [
    track({ id: "t3", title: "Two A", streamUrl: "http://s/3" }),
  ];

  const collection = {
    items: [
      albumItem("a1", "Album One", "https://mock.bandcamp.com/album/one"),
      albumItem("a2", "Album Two", "https://mock.bandcamp.com/album/two"),
    ],
    totalCount: 2,
    lastUpdated: new Date().toISOString(),
  };

  const baseStore = {
    collection,
    selectedArtistId: artistId,
    selectArtist: vi.fn(),
    getAlbumDetails,
    clearQueue,
    addTracksToQueue,
    playQueueStart,
    addTracksToPlaylist: vi.fn(),
    downloadTrack: vi.fn(),
    cachedTrackIds: new Set<string>(),
    cachedAlbumIds: new Set<string>(),
    downloadingTracks: new Set<string>(),
    downloadingAlbumIds: new Set<string>(),
    settings: { offlineMode: false, deduplicateCollection: false },
    goBack: vi.fn(),
    showToast,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearQueue.mockResolvedValue(undefined);
    addTracksToQueue.mockResolvedValue(undefined);
    playQueueStart.mockResolvedValue(undefined);
    (useStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(baseStore);
  });

  it("starts playback after the first album and keeps fetching the rest", async () => {
    let resolveSecond: (album: unknown) => void = () => {};
    const secondAlbum = new Promise((resolve) => {
      resolveSecond = resolve;
    });

    getAlbumDetails.mockImplementation(async (url: string) => {
      if (url.includes("/one")) {
        return { id: "a1", title: "Album One", tracks: albumOneTracks };
      }
      return secondAlbum;
    });

    render(<ArtistsView />);
    fireEvent.click(screen.getByRole("button", { name: /play all/i }));

    await waitFor(() => {
      expect(clearQueue).toHaveBeenCalledWith(false);
      expect(addTracksToQueue).toHaveBeenCalledTimes(1);
      expect(addTracksToQueue).toHaveBeenCalledWith(albumOneTracks);
      expect(playQueueStart).toHaveBeenCalledTimes(1);
    });
    expect(getAlbumDetails).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveSecond({ id: "a2", title: "Album Two", tracks: albumTwoTracks });
    });

    await waitFor(() => {
      expect(addTracksToQueue).toHaveBeenCalledTimes(2);
      expect(addTracksToQueue).toHaveBeenLastCalledWith(albumTwoTracks);
    });
    expect(playQueueStart).toHaveBeenCalledTimes(1);
  });

  it("queues albums that already have tracks even without stream URLs", async () => {
    const loadedTracks = [
      track({ id: "t1", title: "Loaded A", streamUrl: "" }),
      track({ id: "t2", title: "Loaded B", streamUrl: "" }),
    ];
    (useStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...baseStore,
      collection: {
        ...collection,
        items: [
          albumItem("a1", "Album One", "https://mock.bandcamp.com/album/one", loadedTracks),
        ],
      },
    });

    render(<ArtistsView />);
    fireEvent.click(screen.getByRole("button", { name: /play all/i }));

    await waitFor(() => {
      expect(addTracksToQueue).toHaveBeenCalledWith(loadedTracks);
      expect(playQueueStart).toHaveBeenCalled();
    });
    expect(getAlbumDetails).not.toHaveBeenCalled();
  });

  it("queues purchased tracks as tracks instead of scraping the album", async () => {
    const purchased = track({
      id: "pt1",
      title: "Single",
      streamUrl: "",
      bandcampUrl: "https://mock.bandcamp.com/track/single",
    });
    (useStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...baseStore,
      collection: {
        ...collection,
        items: [
          {
            id: "item-t",
            type: "track",
            token: "tok-t",
            purchaseDate: new Date().toISOString(),
            track: purchased,
          },
        ],
      },
    });

    render(<ArtistsView />);
    fireEvent.click(screen.getByRole("button", { name: /play all/i }));

    await waitFor(() => {
      expect(addTracksToQueue).toHaveBeenCalledWith([purchased]);
      expect(playQueueStart).toHaveBeenCalled();
    });
    expect(getAlbumDetails).not.toHaveBeenCalled();
  });

  it("cancels remaining fetches when Play All is clicked again", async () => {
    let resolveSecond: (album: unknown) => void = () => {};
    const secondAlbum = new Promise((resolve) => {
      resolveSecond = resolve;
    });

    getAlbumDetails.mockImplementation(async (url: string) => {
      if (url.includes("/one")) {
        return { id: "a1", title: "Album One", tracks: albumOneTracks };
      }
      return secondAlbum;
    });

    render(<ArtistsView />);
    fireEvent.click(screen.getByRole("button", { name: /play all/i }));

    await waitFor(() => {
      expect(playQueueStart).toHaveBeenCalled();
      expect(screen.getByTitle("Click to cancel")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Click to cancel"));

    await act(async () => {
      resolveSecond({ id: "a2", title: "Album Two", tracks: albumTwoTracks });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /play all/i })).toBeInTheDocument();
    });
    expect(addTracksToQueue).toHaveBeenCalledTimes(1);
    expect(addTracksToQueue).not.toHaveBeenCalledWith(albumTwoTracks);
  });
});
