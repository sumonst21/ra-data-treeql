import getDataProvider, { formatFilter, TreeQLDataProvider } from ".";


class TestDataProvider extends TreeQLDataProvider {
    public getURL(resource: string, params?: Record<string, string>): string {
        return super.getURL(resource, params);
    }
}

const mockHTTP = {
    fetch: (_url: string, _options?) => Promise.resolve({ status: 200, headers: null as any, body: null, json: null })
};

const dataProvider = new TestDataProvider("http://myApi.com/", (url, options) => mockHTTP.fetch(url, options));

const spyOn = jest.spyOn;

describe("getDataProvider", () => {
    it("default export should work", () => {
        expect(getDataProvider("http://myApi.com") instanceof TreeQLDataProvider).toBeTruthy();
    });
});

describe("formatFilter", () => {
    it("default", () => expect(formatFilter({ comment: 4 })).toEqual("comment,eq,4"));
    it("contains", () => expect(formatFilter({ comment_cs: 4 })).toEqual("comment,cs,4"));
    it("start with", () => expect(formatFilter({ comment_sw: 4 })).toEqual("comment,sw,4"));
    it("end with", () => expect(formatFilter({ comment_ew: 4 })).toEqual("comment,ew,4"));
    it("lower than", () => expect(formatFilter({ comment_lt: 4 })).toEqual("comment,lt,4"));
    it("lower or equal", () => expect(formatFilter({ comment_le: 4 })).toEqual("comment,le,4"));
    it("greater or equal", () => expect(formatFilter({ comment_ge: 4 })).toEqual("comment,ge,4"));
    it("greater than", () => expect(formatFilter({ comment_gt: 4 })).toEqual("comment,gt,4"));
    it("between", () => expect(formatFilter({ comment_bt: [4, 8] })).toEqual("comment,bt,4,8"));
    it("in", () => expect(formatFilter({ comment_in: [4, 8, 16, 32] })).toEqual("comment,in,4,8,16,32"));
    it("is null", () => expect(formatFilter({ comment_is: 4 })).toEqual("comment,is"));
    it("unsupported operator", () => expect(formatFilter({ comment_xy: 4 })).toEqual("comment_xy,eq,4"));
    it("type errors", () => {
        try {
            formatFilter({ comment_bt: 4 });
        }
        catch (e) {
            expect(e instanceof TypeError).toBeTruthy();
            expect((e as TypeError).message).toEqual("Array expected as filter value for filter type \"between\" (bt)");
        }

        try {
            formatFilter({ comment_in: 4 });
        }
        catch (e) {
            expect(e instanceof TypeError).toBeTruthy();
            expect((e as TypeError).message).toEqual("Array expected as filter value for filter type \"in\"");
        }
    });
    it("ignore additional arguments", () => {
        expect(formatFilter({ comment_bt: [4, 8, 16, 32] })).toEqual("comment,bt,4,8");
        expect(formatFilter({ comment_is: 4 })).toEqual("comment,is");
    });
});

describe("getURL", () => {
    it("params should be encoded correctly", () => {
        const params = { order: "length,DESC", page: "1,25", filter: formatFilter({ id: 4 }) };
        expect(dataProvider.getURL("comment", params)).toEqual("http://myApi.com/records/comment?order=length,DESC&page=1,25&filter=id,eq,4");
    });
});

describe("dataProvider API", () => {

    let mock: jest.SpyInstance;
    beforeEach(() => {
        mock = spyOn(mockHTTP, "fetch");
    });

    it("create", async () => {
        mock.mockImplementationOnce(() => ({ json: 1 }));
        const result = await dataProvider.create("comment", { data: { id: 1, title: "myComment", content: "This is a test comment" } });

        expect(mock).lastCalledWith(
            "http://myApi.com/records/comment",
            {
                // id shouldn't be required as it is usually generated on the server
                body: JSON.stringify({ title: "myComment", "content": "This is a test comment" }),
                method: "POST"
            }
        );

        expect(result).toEqual({
            data: {
                title: "myComment",
                content: "This is a test comment",
                id: 1
            },
        });
    });

    it("delete", async () => {
        const result = await dataProvider.delete("comment", { id: 1, previousData: { id: 1, title: "myComment", content: "This is a test comment" } });

        expect(mock).lastCalledWith(
            "http://myApi.com/records/comment/1",
            {
                method: "DELETE"
            }
        );

        expect(result).toEqual({
            data: {
                title: "myComment",
                content: "This is a test comment",
                id: 1
            },
        });
    });

    it("delete", async () => {
        const result = await dataProvider.deleteMany("comment", { ids: [1, 2] });

        expect(mock).lastCalledWith(
            "http://myApi.com/records/comment/1,2",
            {
                method: "DELETE"
            }
        );

        expect(result).toEqual({
            data: [1, 2],
        });
    });

    it("getList", async () => {
        mock.mockImplementationOnce(() => ({ json: { records: [{ id: 1, title: "myComment", content: "This is a test comment" }], results: 1 } }));

        const result = await dataProvider.getList("comment", {
            filter: {
                id_in: [1, 2, 3, 4, 5],
                title_cs: "Comm"
            },
            pagination: {
                page: 1,
                perPage: 10
            },
            sort: {
                field: "title",
                order: "ASC"
            }
        });

        expect(mock).lastCalledWith(
            "http://myApi.com/records/comment?order=title,ASC&page=1,10&filter=id,in,1,2,3,4,5&filter=title,cs,Comm",
            undefined
        );

        expect(result).toEqual({
            data:
                [{
                    id: 1,
                    content: "This is a test comment",
                    title: "myComment",
                }],
            total: 1,
        });
    });

    it("getMany", async () => {
        mock.mockImplementationOnce(() => ({
            json: [
                { id: 1, title: "myComment", content: "This is a test comment" },
                { id: 2, title: "secondComment", content: "This is another test comment" }
            ]
        }));

        const result = await dataProvider.getMany("comment", { ids: [1, 2] });

        expect(mock).lastCalledWith(
            "http://myApi.com/records/comment/1,2",
            undefined
        );

        expect(result).toEqual({
            data:
                [{
                    id: 1,
                    content: "This is a test comment",
                    title: "myComment",
                }, {
                    id: 2,
                    content: "This is another test comment",
                    title: "secondComment",
                }]
        });
    });

    it("getMany should still return array when only fetching one record", async () => {
        mock.mockImplementationOnce(() => ({
            json: { id: 1, title: "myComment", content: "This is a test comment" }
        }));

        const result = await dataProvider.getMany("comment", { ids: [1] });

        expect(mock).lastCalledWith(
            "http://myApi.com/records/comment/1",
            undefined
        );

        expect(result).toEqual({
            data:
                [{
                    id: 1,
                    content: "This is a test comment",
                    title: "myComment",
                }]
        });
    });

    it("getManyReference", async () => {
        mock.mockImplementationOnce(() => ({
            json: {
                records: [
                    { id: 1, title: "myComment", content: "This is a test comment" },
                    { id: 2, title: "secondComment", content: "This is another test comment" }
                ],
                results: 2
            }
        }));

        const result = await dataProvider.getManyReference("comment", {
            id: "1",
            target: "post",
            filter: {
                title_cs: "Comm"
            },
            pagination: {
                page: 1,
                perPage: 10
            },
            sort: {
                field: "title",
                order: "ASC"
            }
        });

        expect(mock).lastCalledWith(
            "http://myApi.com/records/comment?order=title,ASC&page=1,10&filter=title,cs,Comm&filter=post,eq,1",
            undefined
        );

        expect(result).toEqual({
            data:
                [{
                    id: 1,
                    content: "This is a test comment",
                    title: "myComment",
                }, {
                    id: 2,
                    content: "This is another test comment",
                    title: "secondComment",
                }],
            total: 2
        });
    });

    it("getOne", async () => {
        mock.mockImplementationOnce(() => ({
            json: {
                id: 1, title: "myComment", content: "This is a test comment"
            }
        }));

        const result = await dataProvider.getOne("comment", {
            id: "1"
        });

        expect(mock).lastCalledWith(
            "http://myApi.com/records/comment/1",
            undefined
        );

        expect(result).toEqual({
            data: {
                id: 1,
                content: "This is a test comment",
                title: "myComment",
            },
        });
    });

    it("update", async () => {
        mock.mockImplementationOnce(() => ({
            json: {
                id: 1, title: "New Title", content: "This is a test comment"
            }
        }));

        const result = await dataProvider.update("comment", {
            id: "1",
            data: {
                title: "New Title"
            },
            previousData: {
                id: 1, title: "myComment", content: "This is a test comment"
            }
        });

        expect(mock).lastCalledWith(
            "http://myApi.com/records/comment/1",
            {
                body: JSON.stringify({
                    title: "New Title"
                }),
                method: "PUT"
            }
        );

        expect(result).toEqual({
            data: {
                id: 1,
                content: "This is a test comment",
                title: "New Title",
            },
        });
    });

    it("update", async () => {
        mock.mockImplementationOnce(() => ({
            json: {
                id: 1, title: "New Title", content: "This is a test comment"
            }
        }));

        const result = await dataProvider.updateMany("comment", {
            ids: [1, 2],
            data: [{
                id: 1,
                title: "New Title"
            }, {
                id: 2,
                title: "Another new Title"
            }],
        });

        expect(mock).lastCalledWith(
            "http://myApi.com/records/comment/1,2",
            {
                body: JSON.stringify([{
                    id: 1,
                    title: "New Title"
                }, {
                    id: 2,
                    title: "Another new Title"
                }]),
                method: "PUT"
            }
        );

        expect(result).toEqual({
            data: [1, 2],
        });
    });

});